
from odoo import fields, models, api, _
from odoo.exceptions import UserError

class BarcodeBorrowWizard(models.TransientModel):
    _name = 'barcode.borrow.wizard'
    _description = 'Borrow Book by Barcode Wizard'

    # These fields correspond to the JavaScript properties
    barcode = fields.Char(string='Barcode')
    book_id = fields.Many2one('library.book', string='Book', required=True,
                              help="The book identified by the barcode. This field is mandatory.")
    borrower_id = fields.Many2one('res.partner', string='Borrower', required=True,
                                  default=lambda self: self.env.user.partner_id)
    due_date = fields.Datetime(string='Due Date', required=True)
    company_id = fields.Many2one('res.company', string='Company',
                                 default=lambda self: self.env.company)

    @api.model
    def create(self, vals):
        # Override create to ensure due_date has a default if not provided
        if 'due_date' not in vals:
            # Set default due date to 14 days from now if not explicitly set
            vals['due_date'] = fields.Datetime.now() + fields.Timedelta(days=14)
        return super().create(vals)

    def action_borrow(self):
        """
        Server-side action to create the actual borrow record.
        This method is called from the JavaScript.
        """
        self.ensure_one() # Ensures only one record is processed at a time

        if not self.book_id:
            raise UserError(_("No book selected. Please scan a barcode to select a book."))
        if not self.borrower_id:
            raise UserError(_("No borrower selected. Please select a borrower."))
        if not self.due_date:
            raise UserError(_("Due date is missing."))

        # Check book availability again (good practice for server-side validation)
        if not self.book_id.is_available: # Assuming 'is_available' field on library.book
            raise UserError(_("This book '%s' is currently not available for borrowing.") % self.book_id.name)

        # Create the actual library.borrow record
        self.env['library.borrow'].create({
            'book_id': self.book_id.id,
            'borrower_id': self.borrower_id.id,
            'borrow_date': fields.Datetime.now(),
            'due_date': self.due_date,
            'company_id': self.company_id.id,
        })
        return {'type': 'ir.actions.act_window_close'} # Close the wizard

