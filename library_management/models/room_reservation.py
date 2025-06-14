from odoo import models, fields, api
from odoo.exceptions import UserError, ValidationError
import time
import logging

_logger = logging.getLogger(__name__)

class RoomReservation(models.Model):
    _name = 'room.reservation'
    _description = 'Library Room Reservation'
    _order = 'start_time desc'
    _check_company_auto = True
    _sql_constraints = [
        ('unique_room_time', 'UNIQUE(room_id, start_time, end_time, status)',
         'This room is already booked for the selected time!')
    ]

    room_id = fields.Many2one(
        'library.room', string='Room', required=True, ondelete='cascade', check_company=True
    )
    user_id = fields.Many2one(
        'res.users', string='Reserved By', required=True, default=lambda self: self.env.user
    )
    start_time = fields.Datetime(
        string='Start Time', required=True, default=fields.Datetime.now
    )
    end_time = fields.Datetime(string='End Time', required=True)
    duration = fields.Float(
        string='Duration (Hours)', compute='_compute_duration', store=True
    )
    status = fields.Selection(
        [('pending', 'Pending'), ('confirmed', 'Confirmed'), ('cancelled', 'Cancelled')],
        string='Status', default='pending', required=True
    )
    company_id = fields.Many2one('res.company', compute='_compute_company_id')

    def _compute_company_id(self):
        """Sets the company for the reservation based on the current environment's company."""
        for record in self:
             record.company_id = record.env.company
    
    library_id = fields.Many2one(
        'library.branch', string='Library Branch', related='room_id.library_id', store=True
    )

    @api.depends('start_time', 'end_time')
    def _compute_duration(self):
        """Calculates the duration of the reservation in hours."""
        for record in self:
            if record.start_time and record.end_time:
                delta = record.end_time - record.start_time
                record.duration = delta.total_seconds() / 3600
            else:
                record.duration = 0.0

    @api.constrains('start_time', 'end_time')
    def _check_time(self):
        """
        Validates reservation times: end time must be after start time,
        cannot reserve in the past, and checks for overlapping reservations.
        """
        for record in self:
            if record.end_time <= record.start_time:
                raise ValidationError("End time must be after start time.")
            if record.start_time < fields.Datetime.now():
                raise ValidationError("Cannot reserve in the past.")
            conflicts = self.search([
                ('room_id', '=', record.room_id.id),
                ('id', '!=', record.id),
                ('status', '!=', 'cancelled'),
                ('start_time', '<', record.end_time),
                ('end_time', '>', record.start_time)
            ])
            if conflicts:
                raise ValidationError("Room is already reserved for this time slot.")

    def action_confirm(self):
        """Confirms a pending room reservation."""
        self.ensure_one()
        if self.status == 'confirmed':
            raise UserError('Reservation is already confirmed.')
        self.status = 'confirmed'
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Reservation Confirmed',
                'message': f'Your reservation for {self.room_id.name} has been confirmed.',
                'type': 'success',
            }
        }

    def action_cancel(self):
        """Cancels a pending room reservation."""
        self.ensure_one()
        if self.status != 'pending':
            raise UserError('Only pending reservations can be cancelled.')
        self.status = 'cancelled'
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Reservation Cancelled',
                'message': f'Your reservation for {self.room_id.name} has been cancelled.',
                'type': 'success',
            }
        }

    @api.model
    def get_available_rooms(self, date, start_time, end_time, library_id=None,
                            has_projector=False, has_whiteboard=False, has_computers=False):
        """
        Finds available rooms within a specified time range, optionally filtered by library and amenities.
        """
        start_dt = fields.Datetime.from_string(start_time)
        end_dt = fields.Datetime.from_string(end_time)
        room_domain = [('company_id', '=', self.env.company.id)]
        if library_id:
            room_domain.append(('library_id', '=', int(library_id)))
        if has_projector:
            room_domain.append(('has_projector', '=', True))
        if has_whiteboard:
            room_domain.append(('has_whiteboard', '=', True))
        if has_computers:
            room_domain.append(('has_computers', '=', True))

        rooms = self.env['library.room'].search(room_domain)
        conflicting_res = self.search([
            ('room_id', 'in', rooms.ids),
            ('status', '=', 'confirmed'),
            ('start_time', '<', end_dt),
            ('end_time', '>', start_dt)
        ])
        busy_room_ids = {res.room_id.id for res in conflicting_res}

        return [{
            'id': room.id,
            'name': room.name,
            'library': room.library_id.name,
            'capacity': room.capacity,
            'has_projector': room.has_projector,
            'has_whiteboard': room.has_whiteboard,
            'has_computers': room.has_computers
        } for room in rooms if room.id not in busy_room_ids][:50]

    @api.model
    def get_reservations(self, start_date, end_date, library_id=None):
        """
        Retrieves room reservations within a given date range,
        with optional filtering by library and user permissions.
        """
        domain = [
            ('status', '!=', 'cancelled'),
            ('start_time', '>=', start_date),
            ('end_time', '<=', end_date),
            ('company_id', '=', self.env.company.id)
        ]
        if library_id and not self.env.user.has_group('library_management.group_admin_user'):
            domain.append(('library_id', '=', int(library_id)))
        elif self.env.user.has_group('library_management.group_normal_user'):
            domain.append(('user_id', '=', self.env.user.id))
        reservations = self.search(domain, limit=500)
        return [{
            'id': res.id,
            'title': f"{res.room_id.name} - {res.user_id.name}",
            'start': res.start_time.isoformat(),
            'end': res.end_time.isoformat(),
            'status': res.status,
            'room_id': res.room_id.id,
            'user_id': res.user_id.id
        } for res in reservations]

    @api.model
    def create(self, vals):
        """Creates a new room reservation and updates the room's status."""
        reservation = super(RoomReservation, self).create(vals)
        if reservation.room_id:
            reservation.room_id._compute_status()
        return reservation
    
    def write(self, vals):
        """Updates a room reservation and recomputes the room's status if relevant fields change."""
        res = super(RoomReservation, self).write(vals)
        for reservation in self:
            if reservation.room_id and any(field in vals for field in ['start_time', 'end_time', 'status']):
                reservation.room_id._compute_status()
        return res
    
    def unlink(self):
        """Deletes room reservations and updates the status of affected rooms."""
        rooms = self.mapped('room_id')
        res = super(RoomReservation, self).unlink()
        rooms._compute_status()
        return res