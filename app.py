#!/usr/bin/env python3
"""
Main entry point for the Assignment Extension Manager Flask application.
This file imports the Flask app from views.py and runs it.
"""

from views import app

if __name__ == '__main__':
    # Run the Flask development server
    app.run(host='0.0.0.0', port=5001, debug=True)
