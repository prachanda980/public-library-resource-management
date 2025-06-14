from odoo import models, fields, api, _

class BookReturnHistory(models.Model):
    _name = 'book.return.history'
    _description = 'Book Return History'
    _order = 'return_date desc'

    borrow_id = fields.Many2one('book.borrow', string='Borrow Record', required=True, ondelete='cascade')
    book_id = fields.Many2one('library.book', related='borrow_id.book_id', string='Book', store=True)
    borrower_id = fields.Many2one('res.users', related='borrow_id.borrower_id', string='Borrower', store=True)
    return_date = fields.Datetime(string='Return Date', required=True, default=fields.Datetime.now)
    processed_by = fields.Many2one('res.users', string='Processed By', required=True, default=lambda self: self.env.user)
    company_id = fields.Many2one('res.company', related='borrow_id.company_id', string='Company', store=True)