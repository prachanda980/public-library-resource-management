odoo.define('library_management.book_management_client_action', function (require) {
    "use strict";

    var AbstractAction = require('web.AbstractAction');
    var core = require('web.core');
    var session = require('web.session');
    var _t = core._t;

    function debounce(func, wait) {
        var timeout;
        return function () {
            var context = this, args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function () {
                func.apply(context, args);
            }, wait);
        };
    }

    var BookManagementClientAction = AbstractAction.extend({
        template: 'library_management.BookManagementTemplate',
        events: {
            'click .back-btn': '_onBack',
            'click .borrow-btn': '_onBorrow',
            'click .return-btn': '_onReturn',
            'click .cancel-btn': '_onCancel',
            'click .barcode-borrow-btn': '_barcodeborrow',
        },

        init: function (parent, action) {
            this._super(parent, action);
            this.bookId = action.params && action.params.book_id ? parseInt(action.params.book_id) : null;
            this.book = null;
            this.current_uid = null;
            this.is_authenticated = false;
            this.is_admin = false;
            this.is_librarian = false;
            this.borrower_id = null;
            this.username = '';
            this.borrow_record = null;
            this._debouncedDoAction = debounce(this.do_action.bind(this), 300);
        },

        start: function () {
            var self = this;
            return this._super().then(function() {
                return self._checkSession();
            }).then(function() {
                var promises = [
                    self._checkLibrarianPermission(self.current_uid),
                    self._fetchBookDetails(),
                ];
                return Promise.all(promises);
            }).then(function () {
                if (self.bookId && self.book) {
                    return self._checkBorrowStatus();
                }
                return Promise.resolve();
            }).then(function() {
                self._updateForm();
            }).catch(function (err) {
                console.error('BookManagementClientAction: Startup error:', err);
                self.do_notify(_t('Error'), _t('Failed to load book details.'));
                self._updateForm();
            });
        },

        _checkSession: function () {
            var self = this;
            return this._rpc({
                route: '/web/session/get_session_info',
            }).then(function (session_data) {
                self.current_uid = session_data.uid;
                self.is_authenticated = !!session_data.uid;
                self.username = session_data.username || session_data.user_context.name;
                self.borrower_id = self.current_uid;
            }).catch(function (error) {
                console.error('BookManagementClientAction: Session check failed:', error);
                self.do_notify(_t('Error'), _t('Could not check session.'));
                throw error;
            });
        },

        _fetchBookDetails: function () {
            var self = this;
            console.log('Fetching details for book:', this.bookId);
            if (!this.bookId) {
                self.book = null;
                return Promise.resolve();
            }

            return this._rpc({
                model: 'library.book',
                method: 'read',
                args: [[this.bookId], [
                    'id', 'title', 'author', 'isbn', 'genre',
                    'published_date', 'cover_image', 'is_available',
                    'company_id'
                ]],
                kwargs: { context: session.user_context }
            }).then(function (books) {
                console.log('Received book data:', books);
                if (!books || books.length === 0) {
                    self.do_notify(_t('Error'), _t('Book not found.'));
                    self.book = null;
                } else {
                    self.book = books[0];
                    console.log('Book loaded:', self.book);
                }
            }).catch(function (err) {
                console.error('BookManagementClientAction: Error fetching book details:', err);
                self.do_notify(_t('Error'), _t('Could not load book details.'));
                self.book = null;
                throw err;
            });
        },

        _checkLibrarianPermission: function (uid) {
            var self = this;
            if (!uid) {
                self.is_librarian = false;
                self.is_admin = false;
                return Promise.resolve();
            }
            return this._rpc({
                model: 'res.users',
                method: 'has_group',
                args: ['library_management.group_librarian_user']
            }).then(function (hasLibraryGroup) {
                return self._rpc({
                    model: 'res.users',
                    method: 'has_group',
                    args: ['library_management.group_admin_user']
                }).then(function (hasAdminGroup) {
                    self.is_librarian = hasLibraryGroup || hasAdminGroup;
                    self.is_admin = hasAdminGroup;
                });
            }).catch(function (err) {
                console.error('BookManagementClientAction: Error checking librarian permission:', err);
            });
        },

        _checkBorrowStatus: function () {
            var self = this;
            console.log('Checking borrow status for book:', this.bookId);
            if (!this.bookId) {
                self.borrow_record = null;
                return Promise.resolve();
            }
            return this._rpc({
                model: 'book.borrow',
                method: 'search_read',
                args: [
                    [['book_id', '=', this.bookId], ['status', 'in', ['borrowed', 'overdue']]],
                    ['id', 'status', 'overdue_days', 'borrower_id', 'book_id']
                ],
                limit: 1,
                kwargs: { context: session.user_context }
            }).then(function (borrow_records) {
                console.log('Borrow records found:', borrow_records);
                if (borrow_records.length) {
                    self.borrow_record = borrow_records[0];
                } else {
                    self.borrow_record = null;
                }
            }).catch(function (err) {
                console.error('BookManagementClientAction: Error checking borrow status:', err);
            });
        },

        _verifyAvailability: function() {
            var self = this;
            return this._rpc({
                model: 'library.book',
                method: 'check_availability',
                args: [this.bookId]
            }).then(function(result) {
                if (!result.can_borrow) {
                    if (result.active_borrow && result.active_borrow.length > 0) {
                        self.do_notify(
                            _t('Book Checked Out'),
                            _t('This book is currently checked out by %s and due on %s').format(
                                result.active_borrow[0].borrower_id[1],
                                result.active_borrow[0].due_date
                            )
                        );
                    } else {
                        self.do_notify(_t('Not Available'), _t('This book is not available for borrowing.'));
                    }
                    return false;
                }
                return true;
            });
        },

        _onBorrow: function (ev) {
            ev.preventDefault();
            var self = this;
            console.log('Borrow clicked:', {
                bookId: self.bookId,
                book: self.book,
                borrower_id: self.borrower_id
            });

            if (!this.is_authenticated) {
                self.do_notify(_t('Error'), _t('Please log in to borrow a book.'));
                return;
            }

            if (!self.bookId || !self.book) {
                console.error('Missing book data:', {bookId: self.bookId, book: self.book});
                self.do_notify(_t('Error'), _t('Book information is incomplete. Please refresh the page.'));
                return;
            }

            this._verifyAvailability().then(function(canBorrow) {
                if (!canBorrow) {
                    self._updateForm();
                    return;
                }

                var wizard_context = {
                    default_book_id: self.bookId,
                    default_borrower_id: self.borrower_id,
                    default_company_id: self.book.company_id ? self.book.company_id[0] : false,
                };
                console.log('Opening borrow wizard with context:', wizard_context);

                self.do_action({
                    type: "ir.actions.act_window",
                    res_model: 'library.borrow.wizard',
                    name: _t('Borrow Book'),
                    view_mode: "form",
                    views: [[false, "form"]],
                    target: "new",
                    context: wizard_context
                }, {
                    on_close: function () {
                        self._checkBorrowStatus().then(function() {
                            return self._fetchBookDetails();
                        }).then(function() {
                            self._updateForm();
                        });
                    }
                });
            }).catch(function(error) {
                console.error('Error in borrow process (availability check):', error);
                self.do_notify(_t('Error'), _t('Could not verify book availability: ' + (error.message?.data?.message || error.message || 'Unknown error')));
            });
        },

        _onReturn: function (ev) {
            ev.preventDefault();
            var self = this;

            if (!this.borrow_record) {
                self.do_notify(_t('Error'), _t('No active borrow record found for this book.'));
                return;
            }
            if (!this.is_librarian) {
                self.do_notify(_t('Error'), _t('Only librarians can process book returns.'));
                return;
            }
            if (this.borrow_record.status === 'returned') {
                self.do_notify(_t('Info'), _t('This book is already marked as returned.'));
                return;
            }

            this._rpc({
                model: 'book.borrow',
                method: 'action_return_book',
                args: [this.borrow_record.id]
            }).then(function (result) {
                return self._checkBorrowStatus();
            }).then(function() {
                return self._fetchBookDetails();
            }).then(function() {
                self._updateForm();
            }).catch(function (err) {
                console.error('BookManagementClientAction: Error processing return:', err);
                self.do_notify(_t('Error'), _t('Error processing return: ' + (err.message?.data?.message || err.message || 'Unknown error')));
            });
        },

        _onBack: function (ev) {
            ev.preventDefault();
            this._debouncedDoAction('library_management.homepage_client_action', { target: 'current' });
        },

        _onCancel: function (ev) {
            ev.preventDefault();
            this._debouncedDoAction('library_management.homepage_client_action', { target: 'current' });
        },

        _barcodeborrow: function (ev) {
            ev.preventDefault();
            var self = this;
            console.log('Barcode borrow clicked');

            if (!this.is_authenticated) {
                self.do_notify(_t('Error'), _t('Please log in to borrow a book.'));
                return;
            }

            var wizard_context = {
                default_borrower_id: self.borrower_id,
            };

            self.do_action({
                type: "ir.actions.act_window",
                res_model: 'barcode.borrow.wizard',
                name: _t('Borrow Book by Barcode'),
                view_mode: "form",
                views: [[false, "form"]],
                target: "new",
                context: wizard_context
            }, {
                on_close: function () {
                    self._checkBorrowStatus().then(function() {
                        return self._fetchBookDetails();
                    }).then(function() {
                        self._updateForm();
                    });
                }
            });
        },

        _updateForm: function () {
            if (!this.$el || this.$el.length === 0) {
                return;
            }

            var updateElement = function(selector, value, defaultValue) {
                var $el = this.$el.find(selector);
                if ($el.length > 0) {
                    $el.text(value || defaultValue || _t('N/A'));
                }
            }.bind(this);

            updateElement('#book_title', this.book && this.book.title);
            updateElement('#book_author', this.book && this.book.author);
            updateElement('#book_isbn', this.book && this.book.isbn);
            updateElement('#book_genre', this.book && this.book.genre);
            updateElement('#book_published_date', this.book && this.book.published_date);

            var $coverImage = this.$el.find('.book-cover-img');
            if ($coverImage.length > 0) {
                $coverImage.attr('src', this.book && this.book.cover_image ? 'data:image/png;base64,' + this.book.cover_image : '/library_management/static/description/icon.png');
            }

            var $statusElement = this.$el.find('#book_status');
            if ($statusElement.length > 0) {
                $statusElement.removeClass('badge bg-success bg-danger');
                if (this.book && this.book.is_available) {
                    $statusElement.text(_t('Available')).addClass('badge bg-success');
                } else {
                    $statusElement.text(_t('Not Available')).addClass('badge bg-danger');
                }
            }

            var $borrowStatusElement = this.$el.find('#borrow_status');
            if ($borrowStatusElement.length > 0) {
                $borrowStatusElement.removeClass('badge bg-primary bg-danger bg-success');
                if (this.borrow_record) {
                    $borrowStatusElement.text(this.borrow_record.status);
                    if (this.borrow_record.status === 'borrowed') {
                        $borrowStatusElement.addClass('badge bg-primary');
                    } else if (this.borrow_record.status === 'overdue') {
                        $borrowStatusElement.addClass('badge bg-danger');
                    } else if (this.borrow_record.status === 'returned') {
                        $borrowStatusElement.addClass('badge bg-success');
                    }
                } else {
                    $borrowStatusElement.text(_t('None'));
                }
            }

            var $overdueDaysElement = this.$el.find('#overdue_days');
            if ($overdueDaysElement.length > 0) {
                $overdueDaysElement.removeClass('text-danger');
                if (this.borrow_record && this.borrow_record.overdue_days > 0) {
                    $overdueDaysElement.text(this.borrow_record.overdue_days).addClass('text-danger');
                } else {
                    $overdueDaysElement.text('0');
                }
            }

            var $borrowBtn = this.$el.find('.borrow-btn');
            if ($borrowBtn.length > 0) {
                var disableBorrow = (
                    !this.book ||
                    !this.book.is_available ||
                    !this.is_authenticated ||
                    !this.borrower_id ||
                    !!this.borrow_record
                );
                $borrowBtn.prop('disabled', disableBorrow);
            }

            var $returnBtn = this.$el.find('.return-btn');
            if ($returnBtn.length > 0) {
                var disableReturn = (
                    !this.book ||
                    !this.borrow_record ||
                    (this.borrow_record && this.borrow_record.status === 'returned') ||
                    !this.is_librarian
                );
                $returnBtn.prop('disabled', disableReturn);
            }

            var $loginMessage = this.$el.find('#login_message');
            if ($loginMessage.length > 0) {
                if (this.is_authenticated) {
                    $loginMessage.hide();
                } else {
                    $loginMessage.show();
                }
            }
        }
    });

    core.action_registry.add('library_management.book_management_client_action', BookManagementClientAction);
    return BookManagementClientAction;
});