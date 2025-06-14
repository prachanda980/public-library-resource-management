from odoo import models, fields, api
from odoo.exceptions import ValidationError, UserError
import logging

_logger = logging.getLogger(__name__)

class RoomReservationWizard(models.TransientModel):
    _name = 'room.reservation.wizard'
    _description = 'Room Reservation Wizard'

    room_id = fields.Many2one('library.room', string='Room', required=True)
    library_id = fields.Many2one('library.branch', string='Library', readonly=True)
    user_id = fields.Many2one('res.users', string='User', required=True, default=lambda self: self.env.user, readonly=True)
    start_time = fields.Datetime(string='Start Time', required=True, default=fields.Datetime.now)
    end_time = fields.Datetime(string='End Time', required=True)
    reservation_made = fields.Boolean(string='Reservation Made', default=False, help="Indicates if the reservation was successfully made")

    @api.onchange('room_id')
    def _onchange_room_id(self):
        if self.room_id:
            self.library_id = self.room_id.library_id
            _logger.info(f"Room selected: {self.room_id.name}, Library: {self.library_id.name}")

    @api.constrains('start_time', 'end_time')
    def _check_time_validity(self):
        for record in self:
            if record.end_time <= record.start_time:
                raise ValidationError("End time must be after start time.")
            if record.start_time < fields.Datetime.now():
                raise ValidationError("Start time cannot be in the past.")

    def action_reserve(self):
        self.ensure_one()
        _logger.info(f"Attempting to reserve room {self.room_id.name} for user {self.user_id.name} from {self.start_time} to {self.end_time}")
        try:
            # Check room availability based on computed status
            if self.room_id.status != 'available':
                _logger.warning(f"Room {self.room_id.name} is not available, status: {self.room_id.status}")
                raise ValidationError(f"The selected room is {self.room_id.status} and cannot be reserved.")

            # Check for overlapping confirmed reservations
            existing_reservations = self.env['room.reservation'].search([
                ('room_id', '=', self.room_id.id),
                ('status', '=', 'confirmed'),
                ('start_time', '<=', self.end_time),
                ('end_time', '>=', self.start_time),
            ])
            if existing_reservations:
                _logger.warning(f"Overlapping reservations found for room {self.room_id.name}: {existing_reservations.ids}")
                raise ValidationError("The room is already reserved for the selected time slot.")

            # Create reservation
            reservation = self.env['room.reservation'].create({
                'room_id': self.room_id.id,
                'user_id': self.user_id.id,
                'start_time': self.start_time,
                'end_time': self.end_time,
                'status': 'pending',
                'library_id': self.library_id.id,
                'company_id': self.env.company.id,
            })
            _logger.info(f"Reservation created: {reservation.id}")

            reservation.action_confirm()

            # Mark reservation as made to update UI
            self.reservation_made = True

            # Return a notification and close the wizard
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'Reservation Successful',
                    'message': f'Your reservation for {self.room_id.name} has been confirmed.',
                    'type': 'success',
                    'next': {
                        'type': 'ir.actions.act_window_close',  # Close the wizard
                    },
                }
            }
        except Exception as e:
            _logger.error(f"Error creating reservation: {str(e)}")
            raise ValidationError(f"Failed to create reservation: {str(e)}")