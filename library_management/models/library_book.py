from odoo import models, fields, api, _
from odoo.exceptions import ValidationError
from datetime import datetime, timedelta
import logging
import barcode
from barcode.writer import ImageWriter
from io import BytesIO
import base64

_logger = logging.getLogger(__name__)

class LibraryBook(models.Model):
    _name = 'library.book'
    _description = 'Library Book'
    _inherit = ['mail.thread', 'mail.activity.mixin']

    title = fields.Char(string="Title", required=True, tracking=True)
    author = fields.Char(string="Author", required=True, tracking=True)
    isbn = fields.Char(string="ISBN", tracking=True)
    genre = fields.Selection([
        ('fiction', 'Fiction'), ('non-fiction', 'Non-Fiction'), ('science', 'Science'),
        ('history', 'History'), ('biography', 'Biography'), ('children', "Children's")
    ], string="Genre", required=True, tracking=True)
    published_date = fields.Date(string="Published Date")
    cover_image = fields.Binary(string="Cover Image", attachment=True)
    barcode = fields.Char(string="Barcode", copy=False, help="Unique identifier for physical copy")
    barcode_image = fields.Binary(string="Barcode Image", help="Generated barcode image")
    library_id = fields.Many2one(
        'library.branch', string="Library Branch", required=True, ondelete='cascade',
        default=lambda self: self._default_library_branch()
    )
    company_id = fields.Many2one(
        'res.company', string='Company', required=True, default=lambda self: self.env.company
    )
    
    is_available = fields.Boolean(
        string='Available', compute='_compute_is_available', store=True, default=True
    )
    book_borrow_ids = fields.One2many('book.borrow', 'book_id', string='Borrow History')
    current_borrow_id = fields.Many2one(
        'book.borrow', compute='_compute_current_borrow', string='Current Checkout'
    )
    active = fields.Boolean(default=True, help="Set to false to hide the book without deleting it.")

    def _default_library_branch(self):
        return self.env['library.branch'].search([('company_id', '=', self.env.company.id)], limit=1).id

    @api.depends('book_borrow_ids.status')
    def _compute_is_available(self):
        for book in self:
            book.is_available = not any(b.status in ['borrowed', 'overdue'] for b in book.book_borrow_ids)

    @api.depends('book_borrow_ids')
    def _compute_current_borrow(self):
        for book in self:
            active_borrow = book.book_borrow_ids.filtered(
                lambda b: b.status in ['borrowed', 'overdue']
            )
            book.current_borrow_id = active_borrow[:1] if active_borrow else False

    @api.constrains('title', 'author', 'genre', 'library_id')
    def _check_required_fields(self):
        for book in self:
            if not all([book.title, book.author, book.genre, book.library_id]):
                raise ValidationError(_("Title, Author, Genre, and Library Branch are required to generate a barcode."))

    def generate_barcode(self):
        for book in self:
            if not book.title:
                continue
            barcode_data = f"{book.id}-{book.title[:20].replace(' ', '_')}"
            try:
                code128 = barcode.get('code128', barcode_data, writer=ImageWriter())
                book.barcode = barcode_data
                buffer = BytesIO()
                code128.write(buffer)
                book.barcode_image = base64.b64encode(buffer.getvalue())
                buffer.close()
            except Exception as e:
                _logger.error(f"Failed to generate barcode for book {book.id}: {str(e)}")
                raise ValidationError(_("Failed to generate barcode: %s") % str(e))

    @api.model
    def create(self, vals):
        record = super(LibraryBook, self).create(vals)
        record.generate_barcode()
        return record

    def write(self, vals):
        result = super(LibraryBook, self).write(vals)
        if 'title' in vals:
            self.generate_barcode()
        return result

    def check_availability(self):
        self.ensure_one()
        active_borrow_count = self.env['book.borrow'].search_count([
            ('book_id', '=', self.id),
            ('status', 'in', ['borrowed', 'overdue'])
        ])
        return {
            'is_available': self.is_available,
            'can_borrow': self.is_available and not active_borrow_count
        }

    def action_borrow_wizard(self):
        self.ensure_one()
        if not self.is_available:
            raise ValidationError(_("This book is not available for borrowing!"))
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'library.borrow.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_book_id': self.id,
                'default_borrower_id': self.env.user.id,
                'default_company_id': self.company_id.id,
            },
        }

    @api.model
    def get_book_by_barcode(self, barcode_str):
        book = self.search([('barcode', '=', barcode_str)], limit=1)
        if not book:
            return {'error': _('Book not found for barcode: %s') % barcode_str}
        return {
            'id': book.id,
            'title': book.title,
            'author': book.author,
            'isbn': book.isbn,
            'genre': book.genre,
            'is_available': book.is_available,
            'company_id': book.company_id.id,
        }

    @api.model
    def get_book_details(self, book_id):
        book = self.browse(book_id)
        if not book.exists():
            return {'error': _('Book not found')}
        return {
            'id': book.id,
            'title': book.title,
            'author': book.author,
            'isbn': book.isbn,
            'genre': book.genre,
            'published_date': book.published_date,
            'cover_image': book.cover_image,
            'is_available': book.is_available,
            'company_id': book.company_id.id if book.company_id else False,
            'barcode': book.barcode,
        }

    @api.model
    def get_home_books(self):
        """Fetches a limited number of available books for the home page."""
        books = self.search([('is_available', '=', True)], order='published_date desc', limit=8)
        book_data = []
        for book in books:
            book_data.append({
                'id': book.id,
                'title': book.title or '',
                'author': book.author or '',
                'published_date': book.published_date.strftime('%Y-%m-%d') if book.published_date else '',
                'cover_image': book.cover_image.decode() if book.cover_image else '',
                'book_borrow_ids': book.book_borrow_ids.ids,
                'borrow_count': len(book.book_borrow_ids),
            })
        return book_data

    @api.model
    def get_dashboard_data(self):
        today = fields.Date.context_today(self)
        weeks, borrowed, returned, reserved, released = [], [], [], [], []

        for i in range(4):
            week_start = today - timedelta(days=today.weekday()) - timedelta(weeks=i)
            week_end = week_start + timedelta(days=6)
            week_start_dt = datetime.combine(week_start, datetime.min.time())
            week_end_dt = datetime.combine(week_end, datetime.max.time())

            weeks.insert(0, f"Week {4 - i}")
            borrowed.insert(0, self.env['book.borrow'].search_count([
                ('borrow_date', '>=', week_start_dt),
                ('borrow_date', '<=', week_end_dt),
                ('book_id', '!=', False)
            ]))
            returned.insert(0, self.env['book.borrow'].search_count([
                ('return_date', '>=', week_start_dt),
                ('return_date', '<=', week_end_dt),
                ('book_id', '!=', False)
            ]))
            reserved.insert(0, self.env['room.reservation'].search_count([
                ('start_time', '>=', week_start_dt),
                ('start_time', '<=', week_end_dt),
                ('status', '=', 'confirmed'),
                ('room_id', '!=', False)
            ]))
            released.insert(0, self.env['room.reservation'].search_count([
                ('end_time', '>=', week_start_dt),
                ('end_time', '<=', week_end_dt),
                ('status', '=', 'confirmed'),
                ('room_id', '!=', False)
            ]))

        total_books = self.search_count([])
        total_rooms = self.env['library.room'].search_count([])
        active_borrowed = self.env['book.borrow'].search_count([
            ('book_id', '!=', False),
            ('return_date', '=', False)
        ])
        now = fields.Datetime.now()
        active_reserved = self.env['room.reservation'].search_count([
            ('room_id', '!=', False),
            ('status', '=', 'confirmed'),
            ('start_time', '<=', now),
            ('end_time', '>=', now)
        ])

        return {
            'borrowing_data': {
                'weeks': weeks,
                'borrowed': borrowed,
                'returned': returned
            },
            'room_reservation_data': {
                'weeks': weeks,
                'reserved': reserved,
                'released': released
            },
            'resource_usage': {
                'book_usage': int((active_borrowed / total_books) * 100) if total_books else 0,
                'room_usage': int((active_reserved / total_rooms) * 100) if total_rooms else 0
            }
        }
