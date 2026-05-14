from flask import Flask, g, request
from flask_cors import CORS
from collections import Counter, defaultdict
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import sys
from pathlib import Path
import time

BACKEND_DIR = Path(__file__).resolve().parent
ROOT_DIR = BACKEND_DIR.parent
for path in (BACKEND_DIR, ROOT_DIR):
    if str(path) not in sys.path:
        sys.path.insert(0, str(path))

from db import db, init_db
from config import Config
from routes import api, jwt
from llm.rag.routes import rag_api
from dotenv import load_dotenv
from rbac import *


load_dotenv()

app = Flask(__name__)

app.config.from_object(Config)

app.register_blueprint(api, url_prefix="/api")
app.register_blueprint(rag_api, url_prefix="/api")

limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["500 per day", "200 per hour"],
    storage_uri="memory://",
)

db.init_app(app)
jwt.init_app(app)

CORS(app, resources={r"/api/*": {"origins": "*"}})

endpoint_counts = Counter()
endpoint_latencies = defaultdict(list)


@app.before_request
def start_timer():
    g.start_time = time.time()


@app.after_request
def log_endpoint_stats(response):
    if request.endpoint in ["get_top_endpoints", "static"]:
        return response

    rule = request.url_rule.rule if request.url_rule else request.path
    method = request.method
    flask_endpoint = request.endpoint or "unknown"
    metric_key = f"[{method}] {rule} ({flask_endpoint})"

    endpoint_counts[metric_key] += 1

    if hasattr(g, "start_time"):
        latency = (time.time() - g.start_time) * 1000  # Convert to milliseconds
        endpoint_latencies[metric_key].append(latency)
        if len(endpoint_latencies[metric_key]) > 100:
            endpoint_latencies[metric_key].pop(0)

    return response


@app.route("/api/endpoints", methods=["GET"])
# @jwt_required()
# @admin_required
def get_top_endpoints():
    stats = []
    # Grab the top 5 most hit routes
    for metric_key, count in endpoint_counts.most_common(5):
        latencies = endpoint_latencies[metric_key]
        avg_latency = round(sum(latencies) / len(latencies), 2) if latencies else 0
        parts = metric_key.split(" ")
        method = parts[0].replace("[", "").replace("]", "")
        route_path = parts[1]
        stats.append(
            {
                "id": metric_key,
                "method": method,
                "endpoint": route_path,
                "hits": count,
                "avg_latency_ms": avg_latency,
            }
        )
    return jsonify(stats)


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
        init_db()

    app.run(debug=True, port=5000)
