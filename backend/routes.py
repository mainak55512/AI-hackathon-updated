from flask import jsonify, request, Blueprint
from datetime import timedelta, datetime
import os
import json
import requests
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
)
from db import *
from rbac import *

api = Blueprint("api", __name__)

jwt = JWTManager()


@jwt.token_in_blocklist_loader
def check_if_token_revoked(jwt_header, jwt_payload):
    jti = jwt_payload["jti"]
    return db.session.query(TokenBlocklist.id).filter_by(jti=jti).scalar() is not None


@jwt.revoked_token_loader
def revoked_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token has been revoked", "code": "TOKEN_REVOKED"}), 401


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token has expired", "code": "TOKEN_EXPIRED"}), 401


@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"error": "Invalid token", "code": "INVALID_TOKEN"}), 422


@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"error": "Authorization required", "code": "MISSING_TOKEN"}), 401


@api.route("/roles", methods=["GET"])
@jwt_required()
def get_roles():
    roles = Role.query.all()
    user = User.query.get(get_jwt_identity())
    role_names = "\n".join([r.name for r in roles])
    Log.info(
        f"""All available roles:
{role_names}
        """,
        user.id,
    )
    return jsonify([r.to_dict() for r in roles])


@api.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Resource not found"}), 404


@api.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405


@api.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error"}), 500


@api.route("/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password required"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid credentials"}), 401

    if not user.is_active:
        return jsonify({"error": "Account is disabled"}), 403

    role_names = [role.name for role in user.roles]

    additional_claims = {"roles": role_names, "username": user.username}

    access_token = create_access_token(
        identity=str(user.id), additional_claims=additional_claims
    )
    refresh_token = create_refresh_token(identity=str(user.id))

    Log.info(f"New Access/Refresh token generated for user `{user.username}`", user.id)

    return jsonify(
        {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "user": user.to_dict(),
        }
    )


@api.route("/auth/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    if not user.is_active:
        return jsonify({"error": "User account is disabled"}), 403

    role_names = [role.name for role in user.roles]

    additional_claims = {"roles": role_names, "username": user.username}
    access_token = create_access_token(
        identity=str(user.id), additional_claims=additional_claims
    )

    Log.info(f"New Refresh token generated for user `{user.username}`", user.id)

    return jsonify({"access_token": access_token})


@api.route("/auth/logout", methods=["DELETE"])
@jwt_required()
def logout():
    user = User.query.get(get_jwt_identity())
    jti = get_jwt()["jti"]
    db.session.add(TokenBlocklist(jti=jti))
    db.session.commit()

    Log.info(f"User `{user.username}` logged out", user.id)

    return jsonify({"message": "Successfully logged out"})


@api.route("/auth/me", methods=["GET"])
@jwt_required()
def me():
    user = User.query.get(get_jwt_identity())
    if not user:
        return jsonify({"error": "User not found"}), 404

    Log.info(
        f"Profile details fetched for user `{user.username}`",
        user.id,
    )
    return jsonify(user.to_dict())


@api.route("/dashboard/stats", methods=["GET"])
@jwt_required()
def dashboard_stats():
    user = User.query.get(get_jwt_identity())
    total_users = User.query.count()
    active_users = User.query.filter_by(is_active=True).count()
    admin_count = User.query.join(User.roles).filter(Role.name == "Admin").count()
    viewer_count = User.query.join(User.roles).filter(Role.name == "Viewer").count()

    Log.info(
        f"""
Dashboard Stats fetched:
Total users: {total_users}
Active users: {active_users}
Inactive users: {total_users - active_users}
Admin count: {admin_count}
Viewer count: {viewer_count}
""",
        user.id,
    )
    return jsonify(
        {
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": total_users - active_users,
            "admin_count": admin_count,
            "viewer_count": viewer_count,
        }
    )


@api.route("/users", methods=["GET"])
@jwt_required()
def get_users():
    """All authenticated users can list users."""
    current_user = User.query.get(get_jwt_identity())
    users = User.query.order_by(User.created_at.desc()).all()
    Log.info(f"All user details are fetched by user `{current_user.username}`")
    return jsonify([u.to_dict() for u in users])


@api.route("/users", methods=["POST"])
@jwt_required()
@admin_required
def create_user():
    current_user = User.query.get(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    required = ["username", "email", "password", "role"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    role = Role.query.filter_by(name=data["role"]).first()
    if not role:
        return jsonify({"error": f"Role '{data['role']}' does not exist"}), 400

    if User.query.filter_by(username=data["username"]).first():
        return jsonify({"error": "Username already taken"}), 409
    if User.query.filter_by(email=data["email"]).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(username=data["username"], email=data["email"], roles=[role])
    user.set_password(data["password"])
    db.session.add(user)
    db.session.commit()

    # new_user = User.query.filter_by(username=data["username"]).first()
    Log.info(
        f"New user `{user.username}` created with following roles: {', '.join([role.name for role in user.roles])}",
        current_user.id,
    )
    return jsonify(user.to_dict()), 201


@api.route("/users/<int:user_id>", methods=["GET"])
@jwt_required()
def get_user(user_id):
    current_user = User.query.get(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    Log.info(f"User details fetched for user `{user.username}`", current_user.id)
    return jsonify(user.to_dict())


@api.route("/users/<int:user_id>", methods=["PUT"])
@jwt_required()
@admin_required
def update_user(user_id):
    current_user = User.query.get(get_jwt_identity())
    user = User.query.get_or_404(user_id)
    data = request.get_json(silent=True) or {}

    changes = []

    if "role" in data:
        role = Role.query.filter_by(name=data["role"]).first()
        if not role:
            return jsonify({"error": f"Role '{data['role']}' does not exist"}), 400
        user.roles = [role]
        changes.append("role")

    if "is_active" in data:
        user.is_active = bool(data["is_active"])
        changes.append("active")
    if "email" in data and data["email"]:
        existing = User.query.filter_by(email=data["email"]).first()
        if existing and existing.id != user_id:
            return jsonify({"error": "Email already in use"}), 409
        user.email = data["email"]
        changes.append("email")
    if "password" in data and data["password"]:
        user.set_password(data["password"])
        changes.append("password")

    db.session.commit()
    Log.info(
        f"Following user fields are updated for the user `{user.username}`: {', '.join(changes)}",
        current_user.id,
    )
    return jsonify(user.to_dict())


@api.route("/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    current_user_id = get_jwt_identity()
    # Prevent self-deletion
    if str(user_id) == str(current_user_id):
        return jsonify({"error": "You cannot delete your own account"}), 400

    user = User.query.get_or_404(user_id)
    db.session.delete(user)
    db.session.commit()
    Log.warn(f"User `{user.username}` deleted", current_user_id)
    return jsonify({"message": f"User '{user.username}' deleted successfully"})


@api.route("/all_logs", methods=["GET"])
@jwt_required()
@admin_required
def get_all_logs():
    return jsonify(Log.all_logs())


@api.route("/get-alerts", methods=["GET"])
@jwt_required()
# @admin_required
def get_alerts():
    return jsonify(
        [
            {
                "id": "FRA-98248",
                "customer": "Aarav Shah",
                "account": "ACC-7742",
                "type": "Account Takeover",
                "channel": "Mobile Banking",
                "amount": 184500,
                "severity": 96,
                "status": "Critical",
                "timestamp": "2026-05-12 07:42:19",
                "summary": "High-confidence account takeover pattern. New device login was followed by beneficiary creation and three rapid IMPS transfers that exceed normal account velocity.",
                "indicators": [
                    "New device fingerprint",
                    "Geo-velocity anomaly",
                    "Fresh beneficiary",
                    "High transfer velocity",
                ],
                "original": "Raw alert: DEVICE_TRUST_LOW; IP_GEO_SHIFT=1820km; PAYEE_AGE=00:04:12; TXN_COUNT_10M=3; TXN_TOTAL=184500; AUTH_STEPUP=FAILED_ONCE",
                "recommendation": "Freeze outbound transfers, verify customer identity, and open priority case review.",
                "caseUrl": "#case-FRA-98241",
            },
            {
                "id": "FRA-98241",
                "customer": "Aarav Shah",
                "account": "ACC-7742",
                "type": "Account Takeover",
                "channel": "Mobile Banking",
                "amount": 184500,
                "severity": 78,
                "status": "Critical",
                "timestamp": "2026-05-12 07:42:19",
                "summary": "High-confidence account takeover pattern. New device login was followed by beneficiary creation and three rapid IMPS transfers that exceed normal account velocity.",
                "indicators": [
                    "New device fingerprint",
                    "Geo-velocity anomaly",
                    "Fresh beneficiary",
                    "High transfer velocity",
                ],
                "original": "Raw alert: DEVICE_TRUST_LOW; IP_GEO_SHIFT=1820km; PAYEE_AGE=00:04:12; TXN_COUNT_10M=3; TXN_TOTAL=184500; AUTH_STEPUP=FAILED_ONCE",
                "recommendation": "Freeze outbound transfers, verify customer identity, and open priority case review.",
                "caseUrl": "#case-FRA-98241",
            },
            {
                "id": "FRA-98218",
                "customer": "Neha Raman",
                "account": "ACC-1908",
                "type": "Card Not Present",
                "channel": "E-commerce",
                "amount": 62999,
                "severity": 84,
                "status": "High",
                "timestamp": "2026-05-12 06:58:03",
                "summary": "Multiple card-not-present attempts across new merchants. Pattern matches historical fraud clusters with repeated authorization retries after partial declines.",
                "indicators": [
                    "Merchant cluster risk",
                    "Retry after decline",
                    "Night-time spike",
                    "Unusual MCC",
                ],
                "original": "Raw alert: CNP_MERCHANT_RISK=HIGH; DECLINE_RETRY=4; MCC_NEW=true; AUTH_WINDOW=03:16-03:24; PRIOR_DISPUTE_CLUSTER=match",
                "recommendation": "Temporarily restrict online card usage and contact customer for transaction validation.",
                "caseUrl": "#case-FRA-98218",
            },
            {
                "id": "FRA-98213",
                "customer": "Neha Raman",
                "account": "ACC-1908",
                "type": "Card Not Present",
                "channel": "E-commerce",
                "amount": 62999,
                "severity": 84,
                "status": "Low",
                "timestamp": "2026-05-12 06:58:03",
                "summary": "Multiple card-not-present attempts across new merchants. Pattern matches historical fraud clusters with repeated authorization retries after partial declines.",
                "indicators": [
                    "Merchant cluster risk",
                    "Retry after decline",
                    "Night-time spike",
                    "Unusual MCC",
                ],
                "original": "Raw alert: CNP_MERCHANT_RISK=HIGH; DECLINE_RETRY=4; MCC_NEW=true; AUTH_WINDOW=03:16-03:24; PRIOR_DISPUTE_CLUSTER=match",
                "recommendation": "Temporarily restrict online card usage and contact customer for transaction validation.",
                "caseUrl": "#case-FRA-98218",
            },
            {
                "id": "FRA-98177",
                "customer": "Kiran Mehta",
                "account": "ACC-4330",
                "type": "Synthetic Identity",
                "channel": "Loan Origination",
                "amount": 350000,
                "severity": 78,
                "status": "High",
                "timestamp": "2026-05-11 23:14:52",
                "summary": "Application identity signals show mismatched employment, thin bureau depth, and document metadata overlap with prior rejected applications.",
                "indicators": [
                    "Thin credit file",
                    "Document reuse signal",
                    "Employer mismatch",
                    "Shared contact metadata",
                ],
                "original": "Raw alert: BUREAU_DEPTH=LOW; DOC_HASH_LINK=2; EMPLOYER_VERIFY=FAIL; PHONE_REUSE=3; EMAIL_AGE_DAYS=11",
                "recommendation": "Route to manual KYC review and hold disbursal until document provenance is verified.",
                "caseUrl": "#case-FRA-98177",
            },
            {
                "id": "FRA-98132",
                "customer": "Riya Kapoor",
                "account": "ACC-2451",
                "type": "ATM Cashout",
                "channel": "ATM",
                "amount": 40000,
                "severity": 63,
                "status": "Medium",
                "timestamp": "2026-05-11 21:02:10",
                "summary": "ATM withdrawals are above the customer baseline and occurred shortly after a debit card PIN reset. Risk is moderate due to known branch city.",
                "indicators": [
                    "PIN reset proximity",
                    "Above baseline cashout",
                    "Known city",
                    "No failed auth",
                ],
                "original": "Raw alert: PIN_RESET_AGE=00:38:44; ATM_WITHDRAWAL=40000; BASELINE_7D=8500; CITY_MATCH=true; AUTH_FAILS=0",
                "recommendation": "Monitor next transactions and request confirmation through secure notification.",
                "caseUrl": "#case-FRA-98132",
            },
        ]
    )


@api.route("/get-kpis", methods=["GET"])
@jwt_required()
# @admin_required
def get_kpis():

    critical_count = 0

    alerts = get_alerts().get_json()

    for alert in alerts:
        status = alert["status"]
        if status == "Critical":
            critical_count += 1

    return jsonify(
        [
            {
                "label": "Open Critical Alerts",
                "value": critical_count,
                "tone": "danger",
                "iconPath": "M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z",
            },
            {
                "label": "Summarization Accuracy",
                "value": "85%",
                "tone": "primary",
                "iconPath": "M4 19V5m0 14h16M8 17v-6m4 6V7m4 10v-3",
            },
            {
                "label": "Triage Time Reduced",
                "value": "60%",
                "tone": "success",
                "iconPath": "M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
            },
            {
                "label": "Analyst Throughput",
                "value": "+40%",
                "tone": "neutral",
                "iconPath": "M13 7h8m0 0v8m0-8-8 8-4-4-6 6",
            },
        ]
    )
