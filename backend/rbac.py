from functools import wraps
from flask import jsonify

from flask_jwt_extended import (
    jwt_required,
    get_jwt_identity,
)

from db import *


def role_required(*roles):
    """Decorator: restrict endpoint to users with one of the given roles."""

    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            user_id = get_jwt_identity()

            user = User.query.get(user_id)

            if not user:
                return jsonify({"error": "User not found"}), 404

            user_role_names = [r.name for r in user.roles]

            has_permission = any(role in user_role_names for role in roles)

            if not has_permission:
                return jsonify(
                    {
                        "error": f"Access denied. Required role(s): {', '.join(roles)}",
                        "code": "FORBIDDEN",
                    }
                ), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(fn):
    return role_required("Admin")(fn)
