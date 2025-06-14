from odoo import models, fields, api

class LibraryBranch(models.Model):
    _name = 'library.branch'
    _description = 'Library Branch'
    _check_company_auto = True
    
    name = fields.Char(string='Library Name', required=True)
    address = fields.Char(string='Address')
    phone = fields.Char(string='Phone')
    email = fields.Char(string='Email')
    active = fields.Boolean(string='Active', default=True)
    company_id = fields.Many2one(
        'res.company', string='Company', required=True, 
        default=lambda self: self.env.company
    )
    room_ids = fields.One2many('library.room', 'library_id', string='Rooms')
    book_ids = fields.One2many('library.book', 'library_id', string='Books Inventory')
    librarian_ids = fields.One2many(
        'res.users', 'library_id', string='Librarians',
        domain="[('groups_id.name', '=', 'Library User')]"
    )
    book_count = fields.Integer(compute='_compute_counts', store=True)
    room_count = fields.Integer(compute='_compute_counts', store=True)
    state = fields.Selection([
        ('draft', 'Draft'), 
        ('open', 'Open'), 
        ('closed', 'Closed')
    ], default='open')
    
    @api.depends('book_ids', 'room_ids')
    def _compute_counts(self):
        for branch in self:
            branch.book_count = len(branch.book_ids)
            branch.room_count = len(branch.room_ids)
    
    def action_archive(self):
        self.write({'active': False})
    
    def action_unarchive(self):
        self.write({'active': True})

    def action_add_librarian(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'res.users',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_library_id': self.id,
                'default_groups_id': [(4, self.env.ref('library_management.group_library_user').id, 0)],
                'default_company_id': self.company_id.id,
            },
        }