odoo.define('library_management.borrow_client_action', function (require) {
    "use strict";

    var AbstractAction = require('web.AbstractAction');
    var core = require = require('web.core');
    var QWeb = core.qweb;
    var _t = core._t;

    /**
     * Client action for managing book borrowing.
     * Allows librarians to scan a book's barcode, view its details,
     * specify a return date, and record the borrowing transaction.
     */
    var BorrowClientAction = AbstractAction.extend({
        template: 'library_management.BorrowClientAction',
        events: {
            'input #barcode': '_onBarcodeInput',
            'click .o_confirm_borrow': '_onConfirmBorrow',
            'click .o_clear_form': '_onClearForm'
        },

        init: function (parent, context) {
            this._super.apply(this, arguments);
            this.barcode = '';
            this.book_name = '';
            this.book_author = '';
            this.book_isbn = '';
            this.user_name = '';
            this.library_name = '';
            this.return_date = '';
        },

        start: function () {
            var self = this;
            return this._super.apply(this, arguments).then(function () {
                self.$('#barcode').focus();
                self._fetchUserData();
            });
        },

        /**
         * Fetches the current user's name and associated library name.
         * Updates the UI to display this information.
         */
        _fetchUserData: function () {
            var self = this;
            return this._rpc({
                model: 'res.users',
                method: 'read',
                args: [[this.env.uid], ['name', 'library_id']],
            }).then(function (users) {
                if (users.length) {
                    self.user_name = users[0].name;
                    self.library_name = users[0].library_id[1] || '';
                    self.renderElement();
                }
            }).catch(function (err) {
                self.do_warn(_t('Error'), _t('Could not load user data.'));
            });
        },

        /**
         * Handles barcode input. Fetches book details if the barcode is valid
         * and the book is available. Updates the UI with book information.
         */
        _onBarcodeInput: function (ev) {
            var self = this;
            var barcode = $(ev.target).val().trim();
            if (barcode.length < 5) return;

            this._rpc({
                model: 'library.book',
                method: 'search_read',
                args: [[['barcode', '=', barcode], ['status', '=', 'available']]],
                fields: ['name', 'author', 'isbn'],
                limit: 1,
            }).then(function (books) {
                if (!books.length) {
                    self.do_warn(_t('Error'), _t('Invalid barcode or book unavailable.'));
                    self._clearBookFields();
                    return;
                }
                self.barcode = barcode;
                self.book_name = books[0].name;
                self.book_author = books[0].author;
                self.book_isbn = books[0].isbn;
                self.renderElement();
            }).catch(function (err) {
                self.do_warn(_t('Error'), _t('Failed to fetch book data.'));
                self._clearBookFields();
            });
        },

        /**
         * Handles the "Confirm Borrow" action.
         * Validates input, creates a new borrow record, and updates the book's status.
         */
        _onConfirmBorrow: function () {
            var self = this;
            var return_date = this.$('#return_date').val();
            if (!this.barcode || !return_date) {
                this.do_warn(_t('Error'), _t('Please enter barcode and return date.'));
                return;
            }

            var returnDate = moment(return_date).toDate();
            if (returnDate <= new Date()) {
                this.do_warn(_t('Error'), _t('Return date must be in the future.'));
                return;
            }

            this._rpc({
                model: 'library.borrow',
                method: 'create',
                args: [{
                    book_id: this._getBookId(),
                    user_id: this.env.uid,
                    borrow_date: moment().format('YYYY-MM-DD HH:mm:ss'),
                    return_date: moment(return_date).format('YYYY-MM-DD HH:mm:ss'),
                    state: 'borrowed',
                }],
            }).then(function () {
                self._rpc({
                    model: 'library.book',
                    method: 'write',
                    args: [[self._getBookId()], { status: 'checked_out' }],
                }).then(function () {
                    self.do_notify(_t('Success'), _t('Book borrowed successfully.'));
                    self._clearForm();
                });
            }).catch(function (err) {
                self.do_warn(_t('Error'), _t('Failed to borrow book: ') + err.data.message);
            });
        },

        /**
         * Retrieves the database ID of the book using its barcode.
         */
        _getBookId: function () {
            var self = this;
            return this._rpc({
                model: 'library.book',
                method: 'search',
                args: [[['barcode', '=', this.barcode]]],
                limit: 1,
            }).then(function (ids) {
                return ids[0];
            });
        },

        /**
         * Clears all form fields when the "Clear Form" button is clicked.
         */
        _onClearForm: function () {
            this._clearForm();
        },

        /**
         * Resets all input fields and the client action's state,
         * then re-renders the UI.
         */
        _clearForm: function () {
            this._clearBookFields();
            this.return_date = '';
            this.renderElement();
            this.$('#barcode').val('').focus();
        },

        /**
         * Clears book-related properties and updates the UI.
         */
        _clearBookFields: function () {
            this.barcode = '';
            this.book_name = '';
            this.book_author = '';
            this.book_isbn = '';
            this.renderElement();
        },
    });

    core.action_registry.add('library_management.borrow_client_action', BorrowClientAction);
    return BorrowClientAction;
});