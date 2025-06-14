from odoo import http
from odoo.http import request

class LibraryBarcodeController(http.Controller):

    @http.route('/library/barcode/scan', type='json', auth='user')
    def scan_barcode(self, barcode, **kwargs):
        """Handle barcode scanning and return book/user details"""
        Book = request.env['library.book']
        Partner = request.env['res.partner']
        
        # Try to find book by barcode
        book = Book.search([('barcode', '=', barcode)], limit=1)
        if book:
            return {
                'type': 'book',
                'id': book.id,
                'name': book.title,
                'is_available': book.is_available
            }
        
        # Try to find user by barcode
        user = Partner.search([('barcode', '=', barcode)], limit=1)
        if user:
            return {
                'type': 'user',
                'id': user.id,
                'name': user.name
            }
        
        return {'error': 'No matching book or user found'}