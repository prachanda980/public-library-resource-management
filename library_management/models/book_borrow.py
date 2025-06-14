from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from datetime import datetime, timedelta
import logging

_logger = logging.getLogger(__name__)

class BookBorrow(models.Model):
    _name = 'book.borrow'
    _description = 'Book Borrow Record'
    _order = 'borrow_date desc'
    _check_company_auto = True

    borrower_id = fields.Many2one(
        'res.users', string='Borrower', required=True, readonly=True,
        default=lambda self: self.env.user.id
    )
    book_id = fields.Many2one(
        'library.book', string='Book', required=True, ondelete='cascade',
        check_company=True, domain=[('is_available', '=', True)]
    )
    user_id = fields.Many2one(
        'res.users', string='Processed By', required=True, readonly=True,
        default=lambda self: self.env.user
    )
    borrow_date = fields.Datetime(
        string='Borrow Date', required=True, readonly=True,
        default=fields.Datetime.now
    )
    return_date = fields.Datetime(string='Return Date')
    due_date = fields.Datetime(
        string='Due Date', required=True,
        default=lambda self: fields.Datetime.now() + timedelta(days=14)
    )
    status = fields.Selection(
        [('borrowed', 'Borrowed'), ('returned', 'Returned'), ('overdue', 'Overdue')],
        string='Status', default='borrowed', compute='_compute_status',
        store=True, readonly=True
    )
    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        default=lambda self: self.env.company
    )
    overdue_days = fields.Integer(
        string='Days Overdue', compute='_compute_overdue_days',
        store=True, readonly=True
    )

    @api.depends('return_date', 'due_date')
    def _compute_status(self):
        """Computes the status of the borrow record based on return and due dates."""
        now = fields.Datetime.now()
        for record in self:
            if record.return_date:
                record.status = 'returned'
            elif record.due_date and now > record.due_date:
                record.status = 'overdue'
            else:
                record.status = 'borrowed'

    @api.depends('due_date', 'status', 'return_date')
    def _compute_overdue_days(self):
        """Calculates the number of days a book is overdue."""
        now = fields.Datetime.now()
        for record in self:
            record.overdue_days = 0
            if record.status == 'overdue':
                record.overdue_days = (now - record.due_date).days
            elif record.status == 'returned' and record.return_date and record.return_date > record.due_date:
                record.overdue_days = (record.return_date - record.due_date).days

    def action_return_book(self):
        """Marks a borrowed book as returned and creates a return history entry."""
        self.ensure_one()
        if self.status == 'returned':
            raise ValidationError(_("This book is already returned!"))

        return_vals = {'return_date': fields.Datetime.now()}

        try:
            with self.env.cr.savepoint():
                self.write(return_vals)
                self.env['book.return.history'].create({
                    'borrow_id': self.id,
                    'return_date': return_vals['return_date'],
                    'processed_by': self.env.user.id
                })

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Book Returned'),
                    'message': _('%s has been successfully returned.') % self.book_id.title,
                    'type': 'success',
                    'sticky': False
                }
            }
        except Exception as e:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Error'),
                    'message': _('Error returning book: %s') % str(e),
                    'type': 'danger'
                }
            }

    @api.model
    def create(self, vals):
        """
        Creates a new book borrow record.
        Includes logic for book availability check and concurrency handling.
        """
        _logger.debug("BookBorrow create: vals received: %s", vals)

        if not vals.get('book_id'):
            raise ValidationError(_("No book specified for borrowing."))

        book_id = vals.get('book_id')
        book = self.env['library.book'].browse(book_id)

        if not book.exists():
            _logger.error("Book ID %s not found for borrowing.", book_id)
            raise ValidationError(_("The specified book does not exist."))

        try:
            # Acquire a row-level lock on the book to prevent race conditions during concurrent borrow attempts.
            self.env.cr.execute("SELECT id FROM library_book WHERE id = %s FOR UPDATE NOWAIT", [book.id])

            book.refresh() # Refresh the book record to get its latest state after locking.

            if not book.is_available:
                raise ValidationError(_("This book is no longer available for borrowing!"))

            record = super().create(vals) # Create the borrow record

            book.write({'is_available': False}) # Update book availability status

            return record

        except ValidationError:
            raise # Re-raise Odoo ValidationErrors directly
        except Exception as e:
            _logger.error("Concurrency or database error during borrow creation for book ID %s: %s", book_id, str(e))
            raise ValidationError(_("This book is currently being processed or an unexpected error occurred. Please try again."))

    def write(self, vals):
        """Updates a book borrow record, preventing book ID changes and updating book availability on status change."""
        if 'book_id' in vals:
            raise ValidationError(_("Cannot change book after borrowing!"))

        res = super().write(vals)

        if 'status' in vals or 'return_date' in vals:
            for record in self:
                # Update the book's availability status based on the borrow record's status.
                record.book_id.sudo().write({
                    'is_available': record.status == 'returned'
                })

        return res

    def unlink(self):
        """Deletes book borrow records, only if they are returned, and updates book availability."""
        for record in self:
            if record.status != 'returned':
                raise ValidationError(_("Cannot delete unreturned borrow records!"))
            # Mark the associated book as available again before deleting the borrow record.
            record.book_id.sudo().write({'is_available': True})
        return super().unlink()

