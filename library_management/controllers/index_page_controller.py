# from odoo import http
# from odoo.http import request
# import logging

# _logger = logging.getLogger(__name__)

# class LibraryIndexController(http.Controller):

#     @http.route('/library/index', type='http', auth='user', website=True)
#     def library_index(self, **kw):
#         # For testing, just return a basic string first
#         return "Library index works!"

#     @http.route('/library/books', type='json', auth='user')
#     def library_books_data(self, **kw):
#         books = request.env['library.book'].search_read([], ['name', 'author'])
#         return books

#     @http.route('/library/rooms', type='json', auth='user')
#     def library_rooms_data(self, **kw):
#         rooms = request.env['library.room'].search_read([], ['name', 'capacity'])
#         return rooms

#     @http.route('/library/my_list', type='json', auth='user')
#     def my_list_data(self, **kw):
#         borrows = request.env['book.borrow'].search_read(
#             [('user_id', '=', request.env.user.id)], 
#             ['book_id', 'state']
#         )
#         reservations = request.env['room.reservation'].search_read(
#             [('user_id', '=', request.env.user.id)], 
#             ['room_id', 'date']
#         )
#         return {
#             'borrows': borrows,
#             'reservations': reservations,
#         }
