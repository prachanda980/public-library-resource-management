odoo.define("library_management.homepage_client_action", function (require) {
  "use strict";

  var AbstractAction = require("web.AbstractAction");
  var core = require("web.core");
  var session = require("web.session");
  var QWeb = core.qweb;
  var _t = core._t;

  var LibraryHomepageClientAction = AbstractAction.extend({
    template: "library_management.library_homepage_template",

    events: {
      "click .newbook": "_onViewDetails",
      "click .reserve-room": "_onReserveRoom",
      "click .view-reservations": "_onViewReservations",
      "click .navigateToHome": "_navigateToHome",
      "click .navigateToBooks": "_navigateToBooks",
      "click .navigateToRooms": "_navigateToRooms",
      "click .navigateToReservations": "_navigateToReservations",
      "click .navigateToProfile": "_navigateToProfile",
      "click .navigateToLogin": "_navigateToLogin",
      "click .navigateToMyList": "_navigateToMyList",
      "click .logoutUser": "_logoutUser",
    },

    /**
     * Initializes the homepage client action, setting up data arrays and flags.
     * @param {Object} parent - The parent widget.
     * @param {Object} action - The action definition, potentially with a 'view' parameter.
     */
    init: function (parent, action) {
      this._super(parent, action);
      this.new_books = [];
      this.popular_books = [];
      this.all_books = [];
      this.all_rooms = [];
      this.my_reservations = [];
      this.borrowed_books = [];
      this.reserved_rooms = [];
      this.user_profile = {};
      this.isDataLoaded = false;
      this.user_logged_in = false;
      this.username = "Guest";
      this._roomPollingInterval = null; // Stores the timeout ID for room availability polling.
      this.lastRoomFetchTime = null; // Stores the timestamp of the last room data fetch.
      this.current_view = (action.params && action.params.view) || "home"; // Current active tab/view.
    },

    /**
     * Starts the client action: checks session info, loads initial data based on view,
     * and starts room polling if on the rooms view.
     */
    start: function () {
      var self = this;
      return this._super.apply(this, arguments).then(function () {
        return self
          ._rpc({
            route: "/web/session/get_session_info",
          })
          .then(function (session_info) {
            self.user_logged_in = !!session_info.uid;
            self.username =
              session_info.username || session_info.name || "Guest";
            if (self.current_view === "rooms") {
              self._startRoomAvailabilityPolling();
            }
            return self._loadDataForView(self.current_view);
          })
          .catch(function (error) {
            console.error(
              "Error during session info or initial data load:",
              error
            );
            self.do_notify(
              _t("Error"),
              _t("Failed to load initial data. Please try again.")
            );
            self.isDataLoaded = true;
            self.renderElement();
          });
      });
    },

    /**
     * Renders the client action's content using QWeb template.
     */
    renderElement: function () {
      this._super();
      this.$el.html(
        QWeb.render(this.template, {
          new_books: this.new_books,
          popular_books: this.popular_books,
          all_books: this.all_books,
          all_rooms: this.all_rooms,
          my_reservations: this.my_reservations,
          borrowed_books: this.borrowed_books,
          reserved_rooms: this.reserved_rooms,
          user_profile: this.user_profile,
          user_logged_in: this.user_logged_in,
          username: this.username,
          current_view: this.current_view,
          isDataLoaded: this.isDataLoaded,
        })
      );
      this.$(".dropdown-toggle").dropdown(); // Initializes Bootstrap dropdowns.
    },

    /**
     * Navigates to the home view and loads its data.
     * @param {Event} ev - The event object (optional).
     */
    _navigateToHome: function (ev) {
      if (ev) ev.preventDefault();
      if (this.current_view !== "home") {
        this.current_view = "home";
        this._stopRoomPolling(); // Stop polling if navigating away from rooms.
        this._loadDataForView("home");
      }
    },

    /**
     * Navigates to the books view and loads its data.
     * @param {Event} ev - The event object (optional).
     */
    _navigateToBooks: function (ev) {
      if (ev) ev.preventDefault();
      if (this.current_view !== "books") {
        this.current_view = "books";
        this._stopRoomPolling();
        this._loadDataForView("books");
      }
    },

    /**
     * Navigates to the rooms view, loads its data, and starts room polling.
     * @param {Event} ev - The event object (optional).
     */
    _navigateToRooms: function (ev) {
      if (ev) ev.preventDefault();
      if (this.current_view !== "rooms") {
        this.current_view = "rooms";
        this._loadDataForView("rooms").then(
          function () {
            this._startRoomAvailabilityPolling();
          }.bind(this)
        );
      }
    },

    /**
     * Navigates to the reservations view and loads its data.
     * @param {Event} ev - The event object (optional).
     */
    _navigateToReservations: function (ev) {
      if (ev) ev.preventDefault();
      if (this.current_view !== "reservations") {
        this.current_view = "reservations";
        this._stopRoomPolling();
        this._loadDataForView("reservations");
      }
    },

    /**
     * Navigates to the profile view and loads its data.
     * @param {Event} ev - The event object (optional).
     */
    _navigateToProfile: function (ev) {
      if (ev) ev.preventDefault();
      if (this.current_view !== "profile") {
        this.current_view = "profile";
        this._stopRoomPolling();
        this._loadDataForView("profile");
      }
    },

    /**
     * Redirects the user to the Odoo login page.
     * @param {Event} ev - The event object (optional).
     */
    _navigateToLogin: function (ev) {
      if (ev) ev.preventDefault();
      this._stopRoomPolling();
      window.location.href = "/web/login";
    },

    /**
     * Navigates to the "My List" view, fetching borrowed books and reserved rooms.
     * Redirects to login if the user is not authenticated.
     * @param {Event} ev - The event object (optional).
     */
    _navigateToMyList: function (ev) {
      if (ev) ev.preventDefault();
      var self = this;
      this._stopRoomPolling();
      this._rpc({
        route: "/web/session/get_session_info",
      })
        .then(function (session_info) {
          if (!session_info.uid) {
            window.location.href = "/web/login";
            return;
          }
          Promise.all([
            self._rpc({
              route: "/library/my_borrowed_books",
              method: "call",
              params: {},
            }),
            self._rpc({
              route: "/library/my_reserved_rooms",
              method: "call",
              params: {},
            }),
          ])
            .then(function ([borrowedBooks, reservedRooms]) {
              self.current_view = "my_list";
              self.isDataLoaded = true;
              self.borrowed_books = borrowedBooks;
              self.reserved_rooms = reservedRooms;
              self.renderElement();
            })
            .catch(function (error) {
              self.do_notify(
                _t("Error"),
                _t(
                  "Failed to load your list: " +
                    (error.message || "Unknown error")
                )
              );
            });
        })
        .catch(function (error) {
          self.do_notify(
            _t("Error"),
            _t("Session check failed: " + (error.message || "Unknown error"))
          );
        });
    },

    /**
     * Logs out the current user and redirects to the home page.
     * @param {Event} ev - The event object (optional).
     */
    _logoutUser: function (ev) {
      if (ev) ev.preventDefault();
      var self = this;
      this._stopRoomPolling();
      session
        .session_logout()
        .then(function () {
          self.user_logged_in = false;
          self.username = "Guest";
          self.current_view = "home";
          self._loadDataForView("home");
        })
        .catch(function (error) {
          self.do_notify(
            _t("Error"),
            _t("Logout failed: " + (error.message || "Unknown error"))
          );
        });
    },

    /**
     * Loads data specific to the given view name.
     * Sets `isDataLoaded` flag and re-renders the element upon completion or error.
     * @param {string} view_name - The name of the view for which to load data.
     * @returns {Promise} A promise that resolves when data is loaded.
     */
    _loadDataForView: function (view_name) {
      var self = this;
      self.isDataLoaded = false;
      self.renderElement(); // Render with loading state

      let dataPromise;
      switch (view_name) {
        case "home":
          dataPromise = self._fetchHomeData();
          break;
        case "books":
          dataPromise = self._fetchBooksData();
          break;
        case "rooms":
          dataPromise = self._fetchRoomsData();
          break;
        case "reservations":
          dataPromise = self._fetchReservationsData();
          break;
        case "profile":
          dataPromise = self._fetchProfileData();
          break;
        case "my_list":
          dataPromise = Promise.resolve(); // Data loaded in _navigateToMyList
          break;
        default:
          dataPromise = Promise.resolve();
          break;
      }

      return dataPromise
        .then(function () {
          self.isDataLoaded = true;
          self.renderElement(); // Render with loaded data
        })
        .catch(function (error) {
          console.error(
            "Error fetching data for view " + view_name + ":",
            error
          );
          self.do_notify(
            _t("Error"),
            _t("Failed to load data. Please try again.")
          );
          self.isDataLoaded = true;
          self.renderElement(); // Render with error state
        });
    },

    /**
     * Fetches "new" and "popular" book data for the homepage.
     * Books are sorted by `borrow_count` for popularity.
     * @returns {Promise} A promise that resolves with the fetched book data.
     */
    _fetchHomeData: function () {
      var self = this;
      return this._rpc({
        model: "library.book",
        method: "get_home_books",
      }).then(function (books) {
        self.new_books = (books || []).map(self._mapBookData);
        self.popular_books = [...self.new_books]
          .sort((a, b) => (b.borrow_count || 0) - (a.borrow_count || 0))
          .slice(0, 8); // Take top 8 popular books.
      });
    },

    /**
     * Fetches all available book data for the books listing page.
     * @returns {Promise} A promise that resolves with the fetched book data.
     */
    _fetchBooksData: function () {
      var self = this;
      return this._rpc({
        model: "library.book",
        method: "search_read",
        domain: [],
        fields: ["id", "title", "author", "is_available", "cover_image"],
        order: [{ name: "title", asc: true }],
      })
        .then(function (books) {
          self.all_books = (books || []).map((book) => ({
            id: book.id,
            title: book.title || _t("Untitled"),
            author: book.author || _t("Unknown Author"),
            is_available: book.is_available,
            cover_image: book.cover_image,
          }));
        })
        .catch(function (error) {
          console.error("Error fetching books:", error);
          self.do_notify(_t("Error"), _t("Could not load books."));
          return Promise.reject(error);
        });
    },

    /**
     * Fetches all available room data for the rooms listing page.
     * Stores the `lastRoomFetchTime` for polling.
     * @returns {Promise} A promise that resolves with the fetched room data.
     */
    _fetchRoomsData: function () {
      var self = this;
      return this._rpc({
        route: "/library/rooms",
        method: "call",
      })
        .then(function (rooms) {
          self.all_rooms = rooms;
          self.lastRoomFetchTime = new Date().toISOString(); // Update timestamp for polling.
          self.renderElement(); // Re-render to show updated room statuses.
          return rooms;
        })
        .catch(function (error) {
          console.error("Error fetching rooms:", error);
          self.do_notify(_t("Error"), _t("Could not load rooms."));
          self.isDataLoaded = true; // Mark as loaded even on error to stop loading spinner.
          self.renderElement();
          return Promise.reject(error);
        });
    },

    /**
     * Fetches reservations made by the current user.
     * Clears `my_reservations` if the user is not logged in.
     * @returns {Promise} A promise that resolves with the fetched reservation data.
     */
    _fetchReservationsData: function () {
      var self = this;
      if (!self.user_logged_in) {
        self.my_reservations = [];
        return Promise.resolve();
      }
      return this._rpc({
        model: "room.reservation",
        method: "search_read",
        domain: [["user_id", "=", session.uid]],
        fields: ["id", "room_id", "start_time", "end_time", "status"],
        order: [{ name: "start_time", asc: false }],
      })
        .then(function (reservations) {
          self.my_reservations = reservations.map((res) => ({
            id: res.id,
            room_name: res.room_id[1],
            start_time: res.start_time,
            end_time: res.end_time,
            status: res.status,
          }));
        })
        .catch(function (error) {
          console.error("Error fetching reservations data:", error);
          self.do_notify(_t("Error"), _t("Could not load reservations."));
          return Promise.reject(error);
        });
    },

    /**
     * Fetches the current user's profile data.
     * Clears `user_profile` if the user is not logged in.
     * @returns {Promise} A promise that resolves with the fetched profile data.
     */
    _fetchProfileData: function () {
      var self = this;
      if (!self.user_logged_in) {
        self.user_profile = {};
        return Promise.resolve();
      }
      return this._rpc({
        route: "/library/user_profile",
        method: "call",
      })
        .then(function (profile) {
          self.user_profile = profile;
        })
        .catch(function (error) {
          console.error("Error fetching profile data:", error);
          self.do_notify(_t("Error"), _t("Could not load profile."));
          return Promise.reject(error);
        });
    },

    /**
     * Maps raw book data from RPC response to a more usable format for the template.
     * @param {Object} book - Raw book object from RPC.
     * @returns {Object} Mapped book object.
     */
    _mapBookData: function (book) {
      return {
        id: book.id,
        title: book.title || book.name || _t("Untitled"),
        author: book.author || _t("Unknown Author"),
        published_date: book.published_date || _t("N/A"),
        cover_image: book.cover_image || null,
        borrow_count: (book.book_borrow_ids || []).length || 0,
      };
    },

    /**
     * Handles the click event for viewing book details.
     * Navigates to the `book_management_client_action` with the selected book's ID.
     * @param {Event} ev - The click event.
     */
    _onViewDetails: function (ev) {
      ev.preventDefault();
      var self = this;
      var bookId = parseInt($(ev.currentTarget).data("book-id"));

      if (bookId && !isNaN(bookId)) {
        self.do_action({
          type: "ir.actions.client",
          name: _t("Book Details"),
          tag: "library_management.book_management_client_action",
          params: {
            book_id: bookId,
          },
          target: "current",
        });
      } else {
        self.do_notify(_t("Error"), _t("Invalid book selected."));
      }
    },

    /**
     * Handles the click event for reserving a room.
     * Opens a wizard for room reservation and redirects to login if not authenticated.
     * Starts room polling on wizard close to refresh room statuses.
     * @param {Event} ev - The click event.
     */
    _onReserveRoom: function (ev) {
      ev.preventDefault();
      var self = this;
      var roomId = parseInt($(ev.currentTarget).data("room-id"));

      if (!this.user_logged_in) {
        this.do_notify(_t("Error"), _t("Please log in to reserve a room."));
        window.location.href = "/web/login";
        return;
      }

      if (!roomId || isNaN(roomId)) {
        this.do_notify(_t("Error"), _t("Invalid room selected."));
        return;
      }
      // Ensure polling is active while wizard is open.
      this._startRoomAvailabilityPolling(); 

      this.do_action(
        {
          type: "ir.actions.act_window",
          res_model: "room.reservation.wizard",
          view_mode: "form",
          views: [[false, "form"]],
          target: "new",
          context: {
            default_room_id: roomId,
            default_user_id: session.uid,
          },
        },
        {
          on_close: function () {
            // Re-fetch room data and restart polling when the reservation wizard is closed.
            if (self.current_view === "rooms") {
              self._fetchRoomsData();
              self._startRoomAvailabilityPolling();
            }
          },
        }
      ).catch(function (error) {
        console.error("Error opening room reservation wizard:", error);
        self.do_notify(_t("Error"), _t("Failed to open reservation form."));
      });
    },

    /**
     * Handles the click event for viewing a room's reservations.
     * Navigates to a client action (tag: 'room_reservation_book') filtered by the room ID.
     * @param {Event} ev - The click event.
     */
    _onViewReservations: function (ev) {
      ev.preventDefault();
      var roomId = parseInt($(ev.currentTarget).data("room-id"));
      if (roomId && !isNaN(roomId)) {
        this.do_action({
          type: "ir.actions.client",
          name: _t("Room Reservations"),
          tag: "room_reservation_book", 
          params: { room_id: roomId },
          target: "reservations",
        });
      } else {
        self.do_notify(_t("Error"), _t("Invalid room selected."));
      }
    },

    /**
     * Starts a polling mechanism to periodically check for updates in room availability.
     * If updates are detected, it re-fetches room data.
     * The polling stops if not on the 'rooms' view or after `maxAttempts`.
     */
    _startRoomAvailabilityPolling: function () {
      var self = this;
      var pollingInterval = 3000; // Poll every 3 seconds.
      var maxAttempts = 20; // Maximum polling attempts before stopping.
      var attempts = 0;

      // Clear any existing polling interval to prevent multiple simultaneous polls.
      if (this._roomPollingInterval) {
        clearTimeout(this._roomPollingInterval);
      }

      function pollRoomAvailability() {
        // Stop polling if max attempts reached or if not on the 'rooms' view.
        if (attempts >= maxAttempts || self.current_view !== "rooms") {
          clearTimeout(self._roomPollingInterval);
          return;
        }

        self
          ._rpc({
            model: "library.room",
            method: "check_room_availability_updates",
            args: [self.lastRoomFetchTime || false],
          })
          .then(function (result) {
            attempts++;
            if (result && result.updated) {
              // If updates found, re-fetch all room data and stop current polling.
              self._fetchRoomsData();
              clearTimeout(self._roomPollingInterval);
              return;
            }
            // Continue polling if no updates or still within attempts limit.
            self._roomPollingInterval = setTimeout(
              pollRoomAvailability,
              pollingInterval
            );
          })
          .catch(function (error) {
            // Log error but continue polling in case of transient issues.
            console.error("Room availability polling error:", error);
            self._roomPollingInterval = setTimeout(
              pollRoomAvailability,
              pollingInterval
            );
          });
      }

      // Start the first poll after the initial interval.
      self._roomPollingInterval = setTimeout(
        pollRoomAvailability,
        pollingInterval
      );
    },

    /**
     * Stops the room availability polling if it's active.
     */
    _stopRoomPolling: function () {
      if (this._roomPollingInterval) {
        clearTimeout(this._roomPollingInterval);
        this._roomPollingInterval = null;
      }
    },

    /**
     * Cleans up the polling interval when the widget is destroyed.
     */
    destroy: function () {
      this._stopRoomPolling();
      this._super.apply(this, arguments);
    },
  });

  core.action_registry.add(
    "library_management.homepage_client_action",
    LibraryHomepageClientAction
  );
  return LibraryHomepageClientAction;
});