from odoo import http, fields
from odoo.http import request
import logging

_logger = logging.getLogger(__name__)

class LibraryController(http.Controller):
    @http.route('/library/rooms', type='json', auth='public')
    def get_rooms(self):
        """
        Retrieves a list of all library rooms with their details.
        Accessible by public users.
        """
        rooms = request.env['library.room'].sudo().search_read(
            [],
            ['id', 'name', 'capacity', 'library_id', 'description', 'has_projector', 'has_whiteboard', 'has_computers', 'status']
        )
        return [{
            'id': room['id'],
            'name': room['name'],
            'capacity': room['capacity'],
            'library_name': room['library_id'][1] if room['library_id'] else '',
            'description': room['description'] or '',
            'has_projector': room['has_projector'],
            'has_whiteboard': room['has_whiteboard'],
            'has_computers': room['has_computers'],
            'status': room['status']
        } for room in rooms]

    @http.route('/library/my_borrowed_books', type='json', auth='user')
    def my_borrowed_books(self):
        """
        Fetches books currently borrowed by the logged-in user (status not 'returned').
        Requires user authentication.
        """
        _logger.info('Fetching borrowed books for user: %s', request.env.user.id)
        loans = request.env['book.borrow'].sudo().search_read(
            [('borrower_id', '=', request.env.user.id), ('status', '!=', 'returned')],
            ['book_id', 'borrow_date', 'due_date']
        )
        result = []
        for loan in loans:
            book_title = loan['book_id'][1] if loan['book_id'] else 'Unknown Title'
            book_author = 'Unknown Author'
            if loan['book_id']: 
                book_author_record = request.env['library.book'].sudo().browse(loan['book_id'][0])
                if book_author_record.exists():
                    book_author = book_author_record.author

            result.append({
                'book_title': book_title,
                'book_author': book_author,
                'borrow_date': loan['borrow_date'].strftime('%Y-%m-%d %H:%M:%S') if loan['borrow_date'] else '',
                'due_date': loan['due_date'].strftime('%Y-%m-%d %H:%M:%S') if loan['due_date'] else '',
            })
        _logger.info('Borrowed books fetched: %s', result)
        return result

    @http.route('/library/my_reserved_rooms', type='json', auth='user')
    def my_reserved_rooms(self):
        """
        Retrieves room reservations made by the logged-in user (status not 'cancelled').
        Requires user authentication.
        """
        _logger.info('Fetching reserved rooms for user: %s', request.env.user.id)
        reservations = request.env['room.reservation'].sudo().search_read(
            [('user_id', '=', request.env.user.id), ('status', '!=', 'cancelled')],
            ['room_id', 'start_time', 'end_time']
        )
        result = [{
            'room_name': reservation['room_id'][1] if reservation['room_id'] else 'Unknown Room',
            'reservation_date': reservation['start_time'].strftime('%Y-%m-%d') if reservation['start_time'] else '',
            'start_time': reservation['start_time'].strftime('%Y-%m-%d %H:%M:%S') if reservation['start_time'] else '',
            'end_time': reservation['end_time'].strftime('%Y-%m-%d %H:%M:%S') if reservation['end_time'] else '',
        } for reservation in reservations]
        _logger.info('Reserved rooms: %s', result)
        return result