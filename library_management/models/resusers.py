from odoo import models, fields, api

class ResUsers(models.Model):
    _inherit = 'res.users'

    library_id = fields.Many2one(
        'library.branch', string='Assigned Library Branch', check_company=True
    )
    borrow_history_ids = fields.One2many(
        'book.borrow', 'user_id', string='Borrowing History'
    )
    reservation_ids = fields.One2many(
        'room.reservation', 'user_id', string='Room Reservations',
        domain="[('company_id', '=', lambda self: self.env.company.id)]"
    )
    

    @api.model
    def create(self, vals):
        user = super().create(vals)

        # If no library_id, try to assign it based on company
        if not user.library_id and user.company_id:
            branch = self.env['library.branch'].search(
                [('company_id', '=', user.company_id.id)], limit=1)
            if branch:
                user.library_id = branch.id

        # Safely add the normal user group if exists
        normal_user_group = self.env.ref('library_management.group_normal_user', raise_if_not_found=False)
        if normal_user_group and normal_user_group.id not in user.groups_id.ids:
            user.groups_id = [(4, normal_user_group.id, 0)]

        # Add them to the employee group if needed for internal access
        employee_group = self.env.ref('base.group_user', raise_if_not_found=False)
        if employee_group and employee_group.id not in user.groups_id.ids:
            user.groups_id = [(4, employee_group.id, 0)]

        return user
