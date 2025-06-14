from odoo import models, fields, api
from odoo.exceptions import UserError, ValidationError
import time
from datetime import datetime, timedelta

class LibraryRoom(models.Model):
    _name = 'library.room'
    _description = 'Library Study Room'
    _check_company_auto = True

    name = fields.Char(string='Room Name', required=True)
    description = fields.Text(string='Description')
    capacity = fields.Integer(string='Capacity', default=1)
    library_id = fields.Many2one(
        'library.branch', string='Library Branch', required=True, ondelete='cascade'
    )
    company_id = fields.Many2one(
        'res.company', string='Company', related='library_id.company_id', store=True
    )
    reservation_ids = fields.One2many('room.reservation', 'room_id', string='Reservations')
    status = fields.Selection(
        [('available', 'Available'), ('reserved', 'Reserved'), ('occupied', 'Occupied')],
        string='Current Status', compute='_compute_status', store=True
    )
    has_projector = fields.Boolean(string='Has Projector')
    has_whiteboard = fields.Boolean(string='Has Whiteboard')
    has_computers = fields.Boolean(string='Has Computers')
    reservation_count = fields.Integer(compute='_compute_reservation_count', string="Reservation Count")
   
    @api.depends('reservation_ids')
    def _compute_reservation_count(self):
        """Calculates the total number of reservations associated with the room."""
        for room in self:
            room.reservation_count = len(room.reservation_ids)

    def action_open_calendar(self):
        """Opens a calendar view filtered by the current room's reservations."""
        return {
            'type': 'ir.actions.act_window',
            'name': f'{self.name} Reservations',
            'res_model': 'room.reservation',
            'view_mode': 'tree,calendar,form',
            'domain': [('room_id', '=', self.id)],
            'context': {
                'default_room_id': self.id,
                'default_library_id': self.library_id.id,
            }
        }

    @api.depends('reservation_ids.start_time', 'reservation_ids.end_time', 'reservation_ids.status')
    def _compute_status(self):
        """
        Computes the current status of the room ('available', 'reserved', 'occupied')
        based on confirmed reservations and current time.
        """
        now = fields.Datetime.now()
        for room in self:
            confirmed_reservations = room.reservation_ids.filtered(lambda r: r.status == 'confirmed')
            active_reservations = confirmed_reservations.filtered(lambda r: r.start_time <= now <= r.end_time)
            upcoming_reservations = confirmed_reservations.filtered(lambda r: r.start_time > now)
            if active_reservations:
                room.status = 'occupied'
            elif upcoming_reservations:
                room.status = 'reserved'
            else:
                room.status = 'available'

    def check_room_availability_updates(self, last_check_time=False):
        """
        Checks if any room records have been updated since a given timestamp.
        Returns a boolean indicating updates and the current timestamp.
        """
        domain = []
        if last_check_time:
            domain = [('write_date', '>', last_check_time)]
        count = self.search_count(domain)
        return {
            'updated': count > 0,
            'timestamp': fields.Datetime.now()
        }

    def get_room_status(self, room_id):
        """Retrieves the current status of a specific room by its ID."""
        room = self.browse(room_id)
        if not room.exists():
            return False
        return room.status

    def update_room_status(self, room_id, new_status):
        """
        Manually updates the status of a specific room.
        Requires the new_status to be one of the predefined options.
        """
        room = self.browse(room_id)
        if room.exists() and new_status in ['available', 'reserved', 'occupied']:
            room.write({'status': new_status})
            return True
        return False