from odoo import http
from odoo.http import request
import json # Not strictly needed as Odoo handles JSON serialization for type='json'

class LibraryManagement(http.Controller):
    @http.route('/library_management/book_details', type='json', auth='user')
    def book_details(self, book_id):
        book = request.env['library.book'].browse(book_id)
        if not book.exists():
            return {}
        return {
            'id': book.id,
            'title': book.title,
            'author': book.author,
            'isbn': book.isbn,
            'genre': book.genre,
            'published_date': book.published_date.strftime('%Y-%m-%d') if book.published_date else '',
            'cover_image': book.cover_image.decode() if book.cover_image else '',
            'is_available': book.is_available,
            
        }


