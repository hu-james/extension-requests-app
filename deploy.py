#!/usr/bin/env python3
"""
Railway deployment script
Sets up database and runs migrations
"""

import os
import subprocess
import sys

def run_command(cmd):
    """Run a shell command"""
    print(f"Running: {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error: {result.stderr}")
        return False
    print(f"Output: {result.stdout}")
    return True

def main():
    """Main deployment script"""
    print("Installing dependencies...")
    if not run_command("pip install -r requirements.txt"):
        sys.exit(1)
    
    # Run database migrations
    print("Running database migrations...")
    if not run_command("python -m flask --app views.py db upgrade"):
        print("Migration failed, trying to initialize database...")
        run_command("python -m flask --app views.py db init")
        run_command("python -m flask --app views.py db migrate -m 'Initial migration'")
        run_command("python -m flask --app views.py db upgrade")
    
    # Generate LTI keys if they don't exist
    print("Generating LTI keys...")
    run_command("python -c 'from lti13_config import lti_config; lti_config.generate_key_pair()'")

if __name__ == "__main__":
    main()
