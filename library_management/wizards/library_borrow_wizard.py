from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from datetime import timedelta
import logging

_logger = logging.getLogger(__name__)

class LibraryBorrowWizard(models.TransientModel):
    _name = 'library.borrow.wizard'
    _description = 'Library Borrow Wizard'

    book_id = fields.Many2one(
        'library.book', string='Book', required=True, readonly=True
    )
    borrower_id = fields.Many2one(
        'res.users', string='Borrower', required=True,
        default=lambda self: self.env.user
    )
    due_date = fields.Datetime(
        string='Due Date', required=True,
        default=lambda self: fields.Datetime.now() + timedelta(days=14)
    )
    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        default=lambda self: self.env.company
    )

    @api.model
    def default_get(self, fields):
        res = super().default_get(fields)
        # Ensure book_id is set from active_id context
        if self._context.get('active_id'):
            res['book_id'] = self._context['active_id']
        # Ensure company_id is set from default_company_id context
        if self._context.get('default_company_id'):
            res['company_id'] = self._context['default_company_id']
        return res

    @api.constrains('due_date')
    def _check_due_date(self):
        for record in self:
            if record.due_date and record.due_date < fields.Datetime.now():
                raise ValidationError(_("Due date cannot be in the past!"))

    def action_borrow_book(self):
        self.ensure_one()
        _logger.debug("Wizard: Attempting to borrow book %s for user %s", self.book_id.title, self.borrower_id.name)

        try:
            # This calls the create method on book.borrow, which includes the concurrency check
            borrow_record = self.env['book.borrow'].create({
                'book_id': self.book_id.id,
                'borrower_id': self.borrower_id.id,
                'due_date': self.due_date,
                'borrow_date': fields.Datetime.now(), # Borrow date set by wizard
                'user_id': self.env.user.id,        # Processed By set by wizard
                'company_id': self.company_id.id,
                'status': 'borrowed'                # Status set by wizard
            })
            _logger.info("Wizard: Book '%s' borrowed successfully (ID: %s)", self.book_id.title, borrow_record.id)
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Book Borrowed'),
                    'message': _('%s has been borrowed successfully!') % self.book_id.title,
                    'type': 'success',
                    'sticky': False,
                    'next': {'type': 'ir.actions.act_window_close'} # Close the wizard window
                }
            }
        except ValidationError as e:
            _logger.warning("Wizard: Validation error during borrow for book %s: %s", self.book_id.id, e.name)
            # Re-raise the ValidationError so Odoo displays it to the user
            raise
        except Exception as e:
            _logger.error("Wizard: Unexpected error borrowing book %s: %s", self.book_id.id, str(e))
            raise ValidationError(_("An unexpected error occurred while processing the borrow request: %s") % str(e))
