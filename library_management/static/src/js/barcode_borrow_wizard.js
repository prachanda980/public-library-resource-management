odoo.define('library_management.barcode_borrow_wizard', function (require) {
"use strict";

var Dialog = require('web.Dialog');
var core = require('web.core');
var _t = core._t;

var loadScript = function(src) {
    return new Promise(function(resolve, reject) {
        if (window.Quagga) return resolve();
        var script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

var BarcodeBorrowWizard = Dialog.extend({
    template: 'library_management.BarcodeBorrowWizardTemplate',
    events: _.extend({}, Dialog.prototype.events, {
        'click .barcode-borrow-wizard-submit': '_onSubmit',
        'click .barcode-borrow-wizard-cancel': '_onWizardCancel',
        'click .scan-barcode': '_onScanBarcode',
        'click .stop-scan': '_onStopScan',
        'change input[name="barcode"]': '_onBarcodeChange',
    }),

    init: function (parent, options) {
        this._super(parent, $.extend({
            title: _t('Borrow Book by Barcode'),
            buttons: [],
            size: 'medium',
        }, options));
        
        // Initialize with default values
        this.book_id = options.context.default_book_id || false;
        this.book_title = options.context.default_book_title || '';
        this.borrower_id = options.context.default_borrower_id || this.env.uid;
        this.borrower_name = '';
        this.company_id = options.context.default_company_id || false;
        
        // Set default due date
        const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        this.default_due_date = this._formatDateTime(dueDate);
        this.barcode = '';
        this.scannerActive = false;
        this.Quagga = window.Quagga || null;
    },

    willStart: function() {
        var self = this;
        return Promise.all([
            this._super.apply(this, arguments),
            loadScript('https://cdn.jsdelivr.net/npm/quagga@0.12.1/dist/quagga.min.js').then(function() {
                self.Quagga = window.Quagga;
            }).catch(function(error) {
                console.error("Failed to load Quagga:", error);
                self.do_warn(_t('Error'), _t('Barcode scanner library failed to load.'));
            })
        ]);
    },

    start: function () {
        var self = this;
        return this._super.apply(this, arguments).then(function () {
            self.$el.find('.modal-dialog').addClass('modal-lg');
            return self._fetchCurrentUser().then(function () {
                self.renderElement();
                self.$('input[name="barcode"]').focus();
            });
        });
    },

    _fetchCurrentUser: function () {
        var self = this;
        return this._rpc({
            model: 'res.users',
            method: 'search_read',
            args: [[['id', '=', this.borrower_id]], ['id', 'name', 'company_id']],
            limit: 1,
        }).then(function (users) {
            if (users.length) {
                self.borrower_id = users[0].id;
                self.borrower_name = users[0].name;
                if (!self.company_id && users[0].company_id) {
                    self.company_id = users[0].company_id[0];
                }
                self.renderElement();
            }
        }).guardedCatch(function (error) {
            console.error("Error fetching user:", error);
        });
    },

    _onBarcodeChange: function (ev) {
        var barcode = this.$('input[name="barcode"]').val().trim();
        if (barcode) {
            this._processBarcode(barcode);
        }
    },

    _onScanBarcode: function () {
        if (this.scannerActive) return;
        var self = this;
        this.scannerActive = true;

        this.$('.camera-preview').show();
        this.$('.stop-scan').show();
        this.$('.scan-barcode').prop('disabled', true);

        this.Quagga.init({
            inputStream: {
                name: "Live",
                type: "LiveStream",
                target: this.$('#barcode-scanner')[0],
                constraints: {
                    facingMode: "environment",
                    aspectRatio: {min: 1, max: 2}
                },
            },
            decoder: {
                readers: ["ean_reader", "code_128_reader", "code_39_reader"]
            },
            locate: true
        }, function(err) {
            if (err) {
                self.do_warn(_t('Error'), _t('Camera access failed: ') + (err.message || err));
                self._onStopScan();
                return;
            }
            self.Quagga.start();
            self.Quagga.onDetected(function(result) {
                var code = result.codeResult.code;
                if (code) {
                    self.$('input[name="barcode"]').val(code).trigger('change');
                    self._onStopScan();
                }
            });
        });
    },

    _onStopScan: function() {
        if (this.scannerActive) {
            try {
                if (this.Quagga) {
                    this.Quagga.offDetected();
                    this.Quagga.stop();
                }
            } catch (e) {
                console.error("Error stopping scanner:", e);
            }
            this.scannerActive = false;
        }
        this.$('.camera-preview').hide();
        this.$('.stop-scan').hide();
        this.$('.scan-barcode').prop('disabled', false);
    },

    _processBarcode: function(barcode) {
        var self = this;
        this._rpc({
            model: 'barcode.borrow.wizard',
            method: 'write',
            args: [[this.id], { 'barcode': barcode }],
        }).then(function () {
            return self._rpc({
                model: 'library.book',
                method: 'get_book_by_barcode',
                args: [barcode],
            }).then(function (data) {
                if (data.error) {
                    self.do_warn(_t('Error'), data.error);
                    self._clearBookData();
                    return;
                }
                
                if (!data.is_available) {
                    self.do_warn(_t('Error'), _t('This book is not available for borrowing!'));
                    self._clearBookData();
                    return;
                }
                
                // Set all required fields
                self.book_id = data.id;
                self.book_title = data.title;
                self.company_id = data.company_id || self.company_id;
                self.barcode = barcode;
                self.renderElement();
            });
        }).guardedCatch(function (error) {
            self.do_warn(_t('Error'), error.message || _t('Failed to fetch book details.'));
            self._clearBookData();
        });
    },
    
    _clearBookData: function() {
        this.book_id = false;
        this.book_title = '';
        this.company_id = false;
        this.renderElement();
    },

    _onSubmit: function () {
        var self = this;
        if (!this.book_id) {
            this.do_warn(_t('Error'), _t('Please scan a valid barcode to select a book.'));
            return;
        }

        var dueDateValue = this.$('input[name="due_date"]').val();
        if (!dueDateValue) {
            this.do_warn(_t('Error'), _t('Due date is missing.'));
            return;
        }

        var values = {
            book_id: this.book_id,
            borrower_id: this.borrower_id,
            due_date: dueDateValue,
            company_id: this.company_id || false, // Ensure company_id is set
        };

        this._rpc({
            model: 'barcode.borrow.wizard',
            method: 'action_borrow',
            args: [[this.id], values],
        }).then(function (result) {
            if (result && result.error) {
                self.do_warn(_t('Error'), result.error);
            } else {
                self.close();
                self.do_notify(_t('Success'), _t('Book borrowed successfully.'));
            }
        }).guardedCatch(function (error) {
            self.do_warn(_t('Error'), error.message || _t('Failed to borrow book.'));
        });
    },

    _onWizardCancel: function () {
        this._onStopScan();
        this.close();
    },

    _formatDateTime: function (date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) {
            return new Date().toISOString().slice(0, 16);
        }
        return date.toISOString().slice(0, 16);
    },

    destroy: function() {
        this._onStopScan();
        this._super.apply(this, arguments);
    },
});

core.action_registry.add('library_management.barcode_borrow_wizard', BarcodeBorrowWizard);
return BarcodeBorrowWizard;
});