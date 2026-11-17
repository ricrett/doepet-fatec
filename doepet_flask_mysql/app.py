import os
from flask import Flask, render_template, request, g, session, redirect, url_for
from flask_cors import CORS
from flask_login import LoginManager
from sqlalchemy import inspect
from doepet_flask_mysql.config import Config
from doepet_flask_mysql.models import db, User
from doepet_flask_mysql.observability.tracing import configure_observability

login_manager = LoginManager()


def create_app(config_class=Config, seed_on_startup: bool = True):
    app = Flask(__name__, template_folder='templates', static_folder='static')
    app.config.from_object(config_class)

    # DT-01: CORS com credenciais para cookies HttpOnly da SPA desacoplada
    CORS(
        app,
        resources={r"/api/*": {"origins": os.getenv('CORS_ORIGINS', '*')}},
        supports_credentials=True,
    )

    # Inicializar extensoes
    db.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Por favor, autentique-se para acessar esta pagina.'
    login_manager.login_message_category = 'warning'

    # DT-05: Middleware OpenTelemetry + X-Correlation-ID + traceparent + Ring Buffer
    configure_observability(app, db)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    @app.context_processor
    def inject_globals():
        theme = request.cookies.get('theme') or session.get('theme', 'light')
        theme = 'dark' if str(theme).lower() in ['dark', 'escuro'] else 'light'
        next_theme = 'light' if theme == 'dark' else 'dark'
        return {
            'current_theme': theme,
            'is_dark': (theme == 'dark'),
            'theme_label': 'Modo Escuro' if theme == 'dark' else 'Modo Claro',
            'next_theme': next_theme,
            'next_theme_label': 'Modo Claro' if theme == 'dark' else 'Modo Escuro',
            'correlation_id': getattr(g, 'correlation_id', ''),
            'policy_version': app.config.get('POLICY_VERSION', 'v1.0-2026'),
        }

    @app.route('/toggle-theme', methods=['GET', 'POST'])
    @app.route('/set-theme/<theme_name>', methods=['GET', 'POST'])
    def toggle_theme(theme_name=None):
        from flask import jsonify

        current_active = request.cookies.get('theme') or session.get('theme', 'light')
        is_currently_dark = str(current_active).lower() in ['dark', 'escuro']
        requested = theme_name or request.args.get('theme') or request.form.get('theme')

        if requested:
            requested = str(requested).strip().lower()
            new_theme = 'dark' if requested in ['dark', 'escuro'] else 'light'
        else:
            new_theme = 'light' if is_currently_dark else 'dark'

        session['theme'] = new_theme
        session.permanent = True
        session.modified = True

        if (
            request.headers.get('X-Requested-With') == 'XMLHttpRequest'
            or request.is_json
            or 'application/json' in request.headers.get('Accept', '')
        ):
            resp = jsonify({'status': 'success', 'theme': new_theme, 'is_dark': (new_theme == 'dark')})
            resp.set_cookie('theme', new_theme, max_age=365 * 24 * 60 * 60, path='/', samesite='Lax')
            return resp

        next_url = request.args.get('next') or request.referrer or url_for('index')
        if '/toggle-theme' in next_url or '/set-theme' in next_url or next_url == request.url:
            next_url = url_for('index')
        response = redirect(next_url)
        response.set_cookie('theme', new_theme, max_age=365 * 24 * 60 * 60, path='/', samesite='Lax')
        return response

    @app.route('/')
    def index():
        from doepet_flask_mysql.models import BloodNeed, Institution, Pet, Donation

        active_needs = (
            BloodNeed.query.filter_by(status='ACTIVE').order_by(BloodNeed.urgencia.asc()).limit(6).all()
        )
        stats = {
            'clinicas_ativas': Institution.query.filter_by(status='ACTIVE').count(),
            'pets_cadastrados': Pet.query.count(),
            'doacoes_realizadas': Donation.query.count(),
            'alertas_ativos': BloodNeed.query.filter_by(status='ACTIVE').count(),
        }
        return render_template('index.html', active_needs=active_needs, stats=stats)

    from doepet_flask_mysql.routes.auth import auth_bp
    from doepet_flask_mysql.routes.institution import institution_bp
    from doepet_flask_mysql.routes.tutor import tutor_bp
    from doepet_flask_mysql.routes.audit import audit_bp
    from doepet_flask_mysql.routes.api_v1 import api_v1_bp

    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(institution_bp, url_prefix='/instituicao')
    app.register_blueprint(tutor_bp, url_prefix='/tutor')
    app.register_blueprint(audit_bp, url_prefix='/auditoria')
    app.register_blueprint(api_v1_bp, url_prefix='/api/v1')

    @app.errorhandler(404)
    def page_not_found(e):
        if request.path.startswith('/api/'):
            return {'error': 'Endpoint REST nao encontrado.'}, 404
        return render_template('errors/404.html'), 404

    @app.errorhandler(500)
    def internal_server_error(e):
        if request.path.startswith('/api/'):
            return {'error': 'Erro interno no servidor.'}, 500
        return render_template('errors/500.html'), 500

    if seed_on_startup and not app.config.get('TESTING', False):
        try:
            with app.app_context():
                if inspect(db.engine).has_table('users'):
                    from doepet_flask_mysql.seed import seed_database
                    seed_database(force=False)
        except Exception:
            pass

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(host='0.0.0.0', port=5000, debug=False)
