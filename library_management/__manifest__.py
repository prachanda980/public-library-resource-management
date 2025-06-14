{
    'name': 'Library Resource Management',
    'version': '13.0.1.0.0',
    'category': 'Library',
    'summary': 'Manage books, rooms, and library resources.',
    'description': 'Library Resource Management for multiple libraries with multi-company support.',
    'author': 'Prachanda Oli',
    'website': 'http://www.yourcompany.com',
    'sequence': 10,
    'depends': ['base', 'web', 'mail','auth_signup'],
    'data': [
        # Security files
        'security/library_group.xml',
        'security/library_record_rules.xml',
        'security/ir.model.access.csv',
        # Model views
        'views/library_branch_view.xml',
        'views/borrow_history_view.xml',
        'views/library_book_view.xml',
        'views/library_room_view.xml',
        'views/res_users_views.xml',
        # Action-dependent views
        'views/room_reservation_views.xml',
        'views/book_borrow_views.xml',
        'wizards/room_reservation_wizard_views.xml',
       'wizards/library_borrow_wizard_template.xml',
        # Menus
        'views/library_menu.xml',
        # Assets
        'views/assets.xml',
        # Controllers (for public access to Library Hub)
        # 'controllers/library_controller.py',
    ],
    'qweb': [
        'static/src/xml/login_signup_templates.xml',
        'static/src/xml/library_dashboard_client_action.xml',
        'static/src/xml/library_book_details_template.xml',
        'static/src/xml/library_homepage_template.xml',
        'static/src/xml/barcode_borrow_template.xml',
    ],
  
    # only loaded in demonstration mode
    'demo': [
        'demo/demo.xml',
    ],
    'demo': [],
    'installable': True,
    'application': True,
}