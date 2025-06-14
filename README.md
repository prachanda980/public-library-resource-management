# 📚 Public Library Resource Management System (Odoo 13)

A user-friendly, scalable, and modular system built with **Odoo 13** to help public libraries (community, university, city libraries) efficiently manage books, users, borrowing activities, and study room reservations. This project leverages **Client Actions**, **QWeb**, and optional external APIs to deliver real-time, multi-library support with role-based access.

---

## 🚀 Project Summary

This system is designed to streamline library operations, enhance user experience, and support three distinct user roles:

- **Normal Users** (Patrons): Can search, borrow books, and reserve study rooms.
- **Library Users** (Staff): Manage borrowing and reservations for a specific library.
- **Admin Users** (Superusers): Oversee all libraries, users, and settings.

It supports Odoo’s **multi-company architecture** to ensure each library operates independently while still being centrally manageable. The system includes barcode-based book borrowing, real-time availability tracking, and role-based access control.

---

## 🎯 Objectives

- ✅ CRUD operations for books and media across multiple libraries.
- ✅ Real-time availability of books and study rooms.
- ✅ Barcode scanning for fast, error-free borrowing.
- ✅ Study room reservation interface with conflict prevention.
- ✅ Role-based user management with access controls.
- ✅ Data separation using Odoo’s multi-company setup.
- ✅ Visual dashboards using QWeb and Client Actions.
- ✅ (Optional) Map-based library locator and user portals.

---

## ✨ Key Features

### 📚 Book Management
- Track title, author, genre, and status (Available/Checked Out)
- Live updates of availability
- Search and filter by metadata
- Separate catalogs per library branch

### 👤 User Management
- Roles: Normal Users, Library Users, Admin Users
- Borrowing history and activity logs
- Role-based visibility and permissions

### 🏫 Study Room Reservation
- Calendar-based interface with time-slot booking
- Auto-conflict checks for overlapping bookings
- Confirmation notifications
- Admin and Library User control over reservations

### 📦 Barcode-Based Borrowing System
- Barcode scanning or manual entry
- Auto-fill user and book data
- Borrow confirmation with return date
- Error handling for invalid or unavailable books

### 🏢 Multi-Company Architecture
- Data isolation per library (e.g., City, Community)
- Independent book, user, and reservation records
- Restricted access based on user roles
- Admin Users can manage across all libraries

---

## 🧱 Technology Stack

- **Framework**: Odoo 13
- **Languages**: Python, XML, JavaScript
- **Frontend**: QWeb Templates + Client Actions
- **Database**: PostgreSQL
- **Integration**: Optional API support, Barcode Scanner Compatibility

---

## 📈 Optional Features (If Time Allows)

- 📊 **Librarian Dashboards** with charts, gauges, and timelines
- 🗺️ **Map-Based Library Locator** for patrons
- 🔐 **User Portals** per library for personal access

---

## 📂 Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/public-library-resource-management.git
