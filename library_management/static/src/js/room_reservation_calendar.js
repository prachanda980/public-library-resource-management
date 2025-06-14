odoo.define('library_management.room_reservation_calendar', function (require) {
    "use strict";

    var core = require('web.core');
    var AbstractAction = require('web.AbstractAction');
    var ajax = require('web.ajax');
    var _ = require('underscore');

    var QWeb = core.qweb;

    var RoomReservation = AbstractAction.extend({
        template: 'library_management.room_reservation_calendar',
        cssLibs: [
            'https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/2.9.0/fullcalendar.min.css'
        ],
        jsLibs: [
            'https://cdnjs.cloudflare.com/ajax/libs/fullcalendar/2.9.0/fullcalendar.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/4.4.1/js/bootstrap.min.js'
        ],
        events: {
            'change .o_library_filter': '_debounced_update_calendar',
            'change .o_projector_filter': '_debounced_update_calendar',
            'change .o_whiteboard_filter': '_debounced_update_calendar',
            'change .o_computers_filter': '_debounced_update_calendar',
            'click .o_book_room': 'open_book_modal',
            'click .o_submit_booking': 'submit_booking',
            'click .o_confirm_reservation': 'confirm_reservation',
            'click .o_cancel_reservation': 'cancel_reservation'
        },

        init: function (parent, context) {
            this._super.apply(this, arguments);
            this.libraries = [];
            this.available_rooms = [];
            this.current_date = moment().format('YYYY-MM-DD');
            this.library_id = null;
            this._debounced_update_calendar = _.debounce(this.update_calendar, 300);
        },

        start: function () {
            var self = this;
            return this._super.apply(this, arguments).then(function () {
                if (self.env.user.has_group('library_management.group_admin_user')) {
                    self._rpc({
                        model: 'library.branch',
                        method: 'search_read',
                        domain: [['company_id', '=', self.env.company_id]],
                        fields: ['id', 'name'],
                        limit: 100
                    }).then(function (libraries) {
                        self.libraries = libraries;
                        self.renderElement();
                        self.init_calendar();
                    });
                } else {
                    self.library_id = self.env.user.library_id || null;
                    self.renderElement();
                    self.init_calendar();
                }
            });
        },

        init_calendar: function () {
            var self = this;
            $('#calendar').fullCalendar({
                header: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'month,agendaWeek,agendaDay'
                },
                defaultView: 'agendaWeek',
                events: function (start, end, timezone, callback) {
                    self._rpc({
                        model: 'room.reservation',
                        method: 'get_reservations',
                        args: [{
                            start_date: start.toISOString(),
                            end_date: end.toISOString(),
                            library_id: self.library_id
                        }]
                    }).then(function (reservations) {
                        callback(reservations);
                    });
                },
                eventClick: function (event) {
                    if (self.env.user.has_group('library_management.group_library_user') || 
                        self.env.user.has_group('library_management.group_admin_user') || 
                        event.user_id === self.env.user.id) {
                        self.$('#manageModal .o_manage_room_name').text(event.title.split(' - ')[0]);
                        self.$('#manageModal .o_manage_user_name').text(event.title.split(' - ')[1]);
                        self.$('#manageModal .o_manage_start_time').text(moment(event.start).format('YYYY-MM-DD HH:mm'));
                        self.$('#manageModal .o_manage_end_time').text(moment(event.end).format('YYYY-MM-DD HH:mm'));
                        self.$('#manageModal .o_manage_status').text(event.status);
                        self.$('#manageModal .o_reservation_id').val(event.id);
                        self.$('#manageModal').modal('show');
                    }
                },
                dayClick: function (date) {
                    self.current_date = date.format('YYYY-MM-DD');
                    self._debounced_update_calendar();
                }
            });
        },

        update_calendar: function () {
            var self = this;
            this.library_id = this.$('.o_library_filter').val() || null;
            this.update_available_rooms();
            $('#calendar').fullCalendar('refetchEvents');
        },

        update_available_rooms: function () {
            var self = this;
            var start_time = this.current_date + ' 08:00:00';
            var end_time = this.current_date + ' 20:00:00';
            this._rpc({
                model: 'room.reservation',
                method: 'get_available_rooms',
                args: [{
                    date: this.current_date,
                    start_time: start_time,
                    end_time: end_time,
                    library_id: this.library_id,
                    has_projector: this.$('.o_projector_filter').is(':checked'),
                    has_whiteboard: this.$('.o_whiteboard_filter').is(':checked'),
                    has_computers: this.$('.o_computers_filter').is(':checked')
                }]
            }).then(function (rooms) {
                self.available_rooms = rooms;
                self.renderElement();
            });
        },

        open_book_modal: function (ev) {
            var room_id = $(ev.currentTarget).data('room-id');
            var room = _.find(this.available_rooms, {id: parseInt(room_id)});
            this.$('#bookingModal .o_room_name').val(room.name);
            this.$('#bookingModal .o_room_id').val(room_id);
            this.$('#bookingModal .o_start_time').val(this.current_date + 'T08:00');
            this.$('#bookingModal .o_end_time').val(this.current_date + 'T09:00');
            this.$('#bookingModal').modal('show');
        },

        submit_booking: function () {
            var self = this;
            var room_id = this.$('#bookingModal .o_room_id').val();
            var start_time = this.$('#bookingModal .o_start_time').val();
            var end_time = this.$('#bookingModal .o_end_time').val();
            this._rpc({
                model: 'room.reservation',
                method: 'create',
                args: [{
                    room_id: parseInt(room_id),
                    start_time: moment(start_time).format('YYYY-MM-DD HH:mm:ss'),
                    end_time: moment(end_time).format('YYYY-MM-DD HH:mm:ss'),
                    status: 'pending'
                }]
            }).then(function () {
                self.$('#bookingModal').modal('hide');
                $('#calendar').fullCalendar('refetchEvents');
                self.do_notify({
                    title: 'Booking Submitted',
                    message: 'Your reservation has been submitted and is pending confirmation.',
                    type: 'success'
                });
            }, function (err) {
                self.do_notify({
                    title: 'Error',
                    message: 'Failed to create reservation. Please try again.',
                    type: 'danger'
                });
            });
        },

        confirm_reservation: function () {
            var self = this;
            var reservation_id = this.$('#manageModal .o_reservation_id').val();
            this._rpc({
                model: 'room.reservation',
                method: 'action_confirm',
                args: [[parseInt(reservation_id)]]
            }).then(function () {
                self.$('#manageModal').modal('hide');
                $('#calendar').fullCalendar('refetchEvents');
            });
        },

        cancel_reservation: function () {
            var self = this;
            var reservation_id = this.$('#manageModal .o_reservation_id').val();
            this._rpc({
                model: 'room.reservation',
                method: 'action_cancel',
                args: [[parseInt(reservation_id)]]
            }).then(function () {
                self.$('#manageModal').modal('hide');
                $('#calendar').fullCalendar('refetchEvents');
            });
        }
    });

    core.action_registry.add('library_management.room_reservation_calendar', RoomReservation);
    return RoomReservation;
});