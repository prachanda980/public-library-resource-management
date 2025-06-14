odoo.define('library_management.LibraryAuthClientAction', function (require) {
"use strict";

var AbstractAction = require('web.AbstractAction');
var core = require('web.core');

var LibraryAuthClientAction = AbstractAction.extend({
    template: "library_management.authpage", 

    start: function () {
        this.show_login();

        // Login form submission
        this.$('#library_login_form').on('submit', (ev) => {
            ev.preventDefault();
            var email = this.$('input[name="login"]').val();
            var password = this.$('input[name="password"]').val();

            this._rpc({
                route: '/library/login',
                params: { login: email, password: password },
            }).then((result) => {
                if (result === 'ok') {
                    this.show_dashboard(email);
                } else {
                    this.$('#login_error').text(result || "Invalid credentials");
                }
            }).catch((error) => {
                console.error(error);
                this.$('#login_error').text("Login failed.");
            });
        });

        // Signup form submission
        this.$('#library_signup_form').on('submit', (ev) => {
            ev.preventDefault();
            var name = this.$('input[name="name"]').val();
            var email = this.$('input[name="login"]').val();
            var password = this.$('input[name="password"]').val();

            this._rpc({
                route: '/library/signup',
                params: { name: name, login: email, password: password },
            }).then((result) => {
                if (result === 'ok') {
                    this.show_dashboard(name);
                } else {
                    this.$('#signup_error').text(result || "Signup failed.");
                }
            }).catch((error) => {
                console.error(error);
                this.$('#signup_error').text("Signup failed.");
            });
        });

        // Toggle to signup form
        this.$('#show_signup').on('click', (ev) => {
            ev.preventDefault();
            this.show_signup();
        });

        // Toggle to login form
        this.$('#show_login').on('click', (ev) => {
            ev.preventDefault();
            this.show_login();
        });

        // Logout button
        this.$('#logout_button').on('click', () => {
            this._rpc({
                route: '/library/logout',
                params: {},
            }).then(() => {
                this.show_login();
            }).catch((error) => {
                console.error(error);
                alert("Logout failed.");
            });
        });
    },

    show_login: function () {
        this.$('#library_login').show();
        this.$('#library_signup').hide();
        this.$('#library_dashboard').hide();
    },

    show_signup: function () {
        this.$('#library_signup').show();
        this.$('#library_login').hide();
        this.$('#library_dashboard').hide();
    },

    show_dashboard: function (user_name) {
        this.$('#library_dashboard').show();
        this.$('#library_dashboard h2').text('Welcome, ' + user_name + '!');
        this.$('#library_login').hide();
        this.$('#library_signup').hide();
    }
});

core.action_registry.add('library_management.LibraryAuthClientAction', LibraryAuthClientAction);

return LibraryAuthClientAction;
});
