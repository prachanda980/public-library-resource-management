from odoo import http
from odoo.http import request
from odoo.exceptions import ValidationError
import logging

_logger = logging.getLogger(__name__)

class LibraryAuthController(http.Controller):
    @http.route('/library/page', type='http', auth='public', website=True)
    def library_page(self, **kw):
        logged_in = request.session.uid is not None
        user_name = request.env.user.name if logged_in else ''
        return request.render('library_management.library_auth_templates', {
            'logged_in': logged_in,
            'user_name': user_name
        })

    @http.route('/library/login', type='json', auth='public', csrf=False)
    def library_login(self, **kwargs):
        email = kwargs.get('login')
        password = kwargs.get('password')
        try:
            uid = request.session.authenticate(request.session.db, email, password)
            if uid:
                return {'status': 'ok', 'user_name': request.env.user.name}
            return {'status': 'error', 'message': 'Invalid credentials'}
        except Exception as e:
            _logger.error('Login failed: %s', e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/library/signup', type='json', auth='public', csrf=False)
    def library_signup(self, **kwargs):
        name = kwargs.get('name')
        email = kwargs.get('login')
        password = kwargs.get('password')

        if not (name and email and password):
            return {'status': 'error', 'message': 'All fields are required.'}

        if request.env['res.users'].sudo().search([('login', '=', email)], limit=1):
            return {'status': 'error', 'message': 'Email already exists.'}

        try:
            user = request.env['res.users'].sudo().create({
                'name': name,
                'login': email,
                'password': password,
                'company_id': request.env.company.id,
                'company_ids': [(6, 0, [request.env.company.id])],
            })

            # Assign internal user and normal user group
            employee_group = request.env.ref('base.group_user')
            normal_user_group = request.env.ref('library_management.group_normal_user', raise_if_not_found=False)
            if employee_group:
                user.sudo().write({
                    'groups_id': [(4, employee_group.id, 0)]
                })
            if normal_user_group:
                user.sudo().write({
                    'groups_id': [(4, normal_user_group.id, 0)]
                })

            request.session.authenticate(request.session.db, email, password)
            return {'status': 'ok', 'user_name': user.name}
        except Exception as e:
            _logger.error('Signup failed: %s', e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/library/logout', type='json', auth='user', csrf=False)
    def library_logout(self):
        request.session.logout()
        return {'status': 'ok'}
