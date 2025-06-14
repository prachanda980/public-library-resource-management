odoo.define('library_management.dashboard_client_action', function (require) {
    "use strict";

    var AbstractAction = require('web.AbstractAction');
    var core = require('web.core');
    var _t = core._t;

    var LibraryDashboard = AbstractAction.extend({
        template: 'library_management.DashboardClientAction',
        events: {
            'click .o_refresh_dashboard': '_onRefresh'
        },

        /**
         * Initializes the dashboard client action, setting up data containers.
         */
        init: function (parent, context) {
            this._super.apply(this, arguments);
            this.borrowing_data = {};
            this.room_borrowing_data = {};
            this.resource_usage = {};
        },

        /**
         * Starts the client action by fetching data, rendering the element, and drawing charts.
         */
        start: function () {
            var self = this;
            return this._super.apply(this, arguments).then(function () {
                return self._fetchDashboardData().then(function () {
                    self.renderElement();
                    self.renderCharts();
                });
            });
        },

        /**
         * Fetches dashboard-related data (borrowing trends, room usage) from the server.
         */
        _fetchDashboardData: function () {
            var self = this;
            return this._rpc({
                model: 'library.book', // Assuming get_dashboard_data is on library.book model
                method: 'get_dashboard_data',
                args: [],
            }).then(function (data) {
                self.borrowing_data = data.borrowing_data || {};
                self.room_borrowing_data = data.room_borrowing_data || {};
                self.resource_usage = data.resource_usage || {};
            }).catch(function (err) {
                console.error('Error fetching dashboard data:', err);
                self.do_warn(_t('Error'), _t('Could not load dashboard data.'));
            });
        },

        /**
         * Renders various charts (bar charts for trends, JustGage for usage) using fetched data.
         */
        renderCharts: function () {
            var self = this;

            // Book borrowing trend chart (Chart.js Bar Chart)
            var borrowingChartCanvas = document.getElementById('borrowingTrendChart');
            if (borrowingChartCanvas) {
                new Chart(borrowingChartCanvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: self.borrowing_data.weeks || [],
                        datasets: [
                            {
                                label: 'Books Borrowed',
                                data: self.borrowing_data.borrowed || [],
                                backgroundColor: '#28a745'
                            },
                            {
                                label: 'Books Returned',
                                data: self.borrowing_data.returned || [],
                                backgroundColor: '#007bff'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            x: { stacked: true },
                            y: { stacked: true, beginAtZero: true }
                        }
                    }
                });
            }

            // Room borrowing trend chart (Chart.js Bar Chart)
            var roomBorrowingChartCanvas = document.getElementById('roomBorrowingTrendChart');
            if (roomBorrowingChartCanvas) {
                new Chart(roomBorrowingChartCanvas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: self.room_borrowing_data.weeks || [],
                        datasets: [
                            {
                                label: 'Rooms Reserved',
                                data: self.room_borrowing_data.reserved || [],
                                backgroundColor: '#fd7e14'
                            },
                            {
                                label: 'Rooms Released',
                                data: self.room_borrowing_data.released || [],
                                backgroundColor: '#17a2b8'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        scales: {
                            x: { stacked: true },
                            y: { stacked: true, beginAtZero: true }
                        }
                    }
                });
            }

            // Book usage gauge (JustGage)
            var bookGaugeDiv = document.getElementById('bookUsageGauge');
            if (bookGaugeDiv) {
                new JustGage({
                    id: 'bookUsageGauge',
                    value: self.resource_usage.book_usage || 0,
                    min: 0,
                    max: 100,
                    title: 'Book Usage (%)',
                    label: '% Books Borrowed',
                    levelColors: ['#dc3545', '#ffc107', '#28a745']
                });
            }

            // Room usage gauge (JustGage)
            var roomGaugeDiv = document.getElementById('roomUsageGauge');
            if (roomGaugeDiv) {
                new JustGage({
                    id: 'roomUsageGauge',
                    value: self.resource_usage.room_usage || 0,
                    min: 0,
                    max: 100,
                    title: 'Room Usage (%)',
                    label: '% Rooms Reserved',
                    levelColors: ['#dc3545', '#ffc107', '#28a745']
                });
            }
        },

        /**
         * Handles the refresh button click, re-fetches data, and re-renders the dashboard.
         * @param {Event} ev - The click event.
         */
        _onRefresh: function (ev) {
            ev.preventDefault();
            var self = this;
            this._fetchDashboardData().then(function () {
                self.renderElement();
                self.renderCharts();
                self.do_notify(_t('Success'), _t('Dashboard refreshed.'));
            });
        },
    });

    core.action_registry.add('library_management.dashboard_client_action', LibraryDashboard);

    return LibraryDashboard;
});