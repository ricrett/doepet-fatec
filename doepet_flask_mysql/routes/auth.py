from flask import Blueprint, render_template, request, redirect, url_for, flash, g
from flask_login import login_user, logout_user, login_required, current_user
from doepet_flask_mysql.models import db, User, Institution, Tutor, PrivacyConsent, AuditLog
import re

auth_bp = Blueprint('auth', __name__)

def record_audit(action, res_type, res_id, actor_id=None, actor_type='SYSTEM', before=None, after=None):
    corr = getattr(g, 'correlation_id', 'direct')
    audit = AuditLog(
        actor_id=actor_id,
        actor_type=actor_type,
        action=action,
        resource_type=res_type,
        resource_id=str(res_id),
        correlation_id=corr,
        before_data=before,
        after_data=after,
        ip_address=request.remote_addr,
        user_agent=request.user_agent.string[:250] if request.user_agent else None
    )
    db.session.add(audit)
    db.session.commit()

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if current_user.is_authenticated:
        if current_user.role in ['INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE']:
            return redirect(url_for('institution.dashboard'))
        elif current_user.role == 'TUTOR':
            return redirect(url_for('tutor.dashboard'))
        return redirect(url_for('index'))

    if request.method == 'POST':
        raw_identifier = request.form.get('email', '').strip()
        email = raw_identifier.lower()
        password = request.form.get('password', '')

        user = User.query.filter_by(email=email).first()
        if not user:
            tutor = Tutor.query.filter_by(cpf=raw_identifier).first()
            if tutor:
                user = User.query.get(tutor.user_id)
        if not user:
            inst = Institution.query.filter_by(cnpj=raw_identifier).first()
            if inst:
                user = User.query.get(inst.user_id)

        if user and user.check_password(password):
            if not user.is_active:
                flash('Sua conta está desativada. Entre em contato com o suporte.', 'danger')
                return render_template('auth/login.html')

            login_user(user)
            record_audit('USER_LOGIN', 'User', user.id, actor_id=user.id, actor_type=user.role)
            flash('Autenticação realizada com sucesso!', 'success')

            if user.role in ['INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE']:
                return redirect(url_for('institution.dashboard'))
            elif user.role == 'TUTOR':
                return redirect(url_for('tutor.dashboard'))
            return redirect(url_for('index'))
        else:
            flash('E-mail ou senha inválidos.', 'danger')

    return render_template('auth/login.html')

@auth_bp.route('/logout')
@login_required
def logout():
    record_audit('USER_LOGOUT', 'User', current_user.id, actor_id=current_user.id, actor_type=current_user.role)
    logout_user()
    flash('Sessão encerrada com segurança.', 'info')
    return redirect(url_for('index'))

@auth_bp.route('/cadastro-tutor', methods=['GET', 'POST'])
def register_tutor():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        nome = request.form.get('nome', '').strip()
        cpf = request.form.get('cpf', '').strip()
        telefone = request.form.get('telefone', '').strip()
        cidade = request.form.get('cidade', '').strip()
        estado = request.form.get('estado', '').strip().upper()
        bairro = request.form.get('bairro', '').strip()
        cep = request.form.get('cep', '').strip()
        lgpd_aceite = request.form.get('lgpd_aceite') == 'on'

        if not lgpd_aceite:
            flash('É obrigatório concordar com os Termos de Privacidade e LGPD.', 'warning')
            return render_template('auth/register_tutor.html')

        if User.query.filter_by(email=email).first():
            flash('Este e-mail já está cadastrado na plataforma.', 'danger')
            return render_template('auth/register_tutor.html')

        if Tutor.query.filter_by(cpf=cpf).first():
            flash('Este CPF já está cadastrado.', 'danger')
            return render_template('auth/register_tutor.html')

        # Transação segura
        try:
            user = User(email=email, role='TUTOR')
            user.set_password(password)
            db.session.add(user)
            db.session.flush()

            tutor = Tutor(
                user_id=user.id,
                nome=nome,
                cpf=cpf,
                telefone=telefone,
                cidade=cidade,
                estado=estado,
                bairro=bairro,
                cep=cep
            )
            db.session.add(tutor)

            consent = PrivacyConsent(
                user_id=user.id,
                versao_politica='v1.0-2026',
                aceito=True,
                ip_address=request.remote_addr,
                user_agent=request.user_agent.string[:250] if request.user_agent else None
            )
            db.session.add(consent)
            db.session.commit()

            record_audit('REGISTER_TUTOR', 'Tutor', tutor.id, actor_id=user.id, actor_type='TUTOR')
            flash('Cadastro de tutor realizado com sucesso! Faça seu login.', 'success')
            return redirect(url_for('auth.login'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao registrar tutor: {str(e)}', 'danger')

    return render_template('auth/register_tutor.html')

@auth_bp.route('/cadastro-instituicao', methods=['GET', 'POST'])
def register_institution():
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        cnpj = request.form.get('cnpj', '').strip()
        razao_social = request.form.get('razao_social', '').strip()
        nome_fantasia = request.form.get('nome_fantasia', '').strip()
        crmv = request.form.get('crmv', '').strip()
        telefone = request.form.get('telefone', '').strip()
        cidade = request.form.get('cidade', '').strip()
        estado = request.form.get('estado', '').strip().upper()
        endereco = request.form.get('endereco', '').strip()
        cep = request.form.get('cep', '').strip()
        capacidade = int(request.form.get('capacidade_diaria', 10))
        lgpd_aceite = request.form.get('lgpd_aceite') == 'on'

        if not lgpd_aceite:
            flash('É obrigatório concordar com as diretrizes da LGPD.', 'warning')
            return render_template('auth/register_institution.html')

        if Institution.query.filter_by(cnpj=cnpj).first():
            flash('Este CNPJ já está cadastrado na plataforma.', 'danger')
            return render_template('auth/register_institution.html')

        try:
            user = User(email=email, role='INSTITUTION_ADMIN')
            user.set_password(password)
            db.session.add(user)
            db.session.flush()

            inst = Institution(
                user_id=user.id,
                cnpj=cnpj,
                razao_social=razao_social,
                nome_fantasia=nome_fantasia,
                crmv_responsavel=crmv,
                telefone=telefone,
                email_contato=email,
                endereco=endereco,
                cidade=cidade,
                estado=estado,
                cep=cep,
                capacidade_diaria=capacidade,
                status='ACTIVE'
            )
            db.session.add(inst)
            db.session.flush()

            # Cria estoque inicial zerado com regras RN04/RN05
            for esp, tipos in [('CANINA', ['DEA 1.1 Positivo', 'DEA 1.1 Negativo']), ('FELINA', ['Tipo A', 'Tipo B'])]:
                for t in tipos:
                    inv = BloodInventory(
                        institution_id=inst.id,
                        especie=esp,
                        tipo_sanguineo=t,
                        componente='SANGUE_TOTAL',
                        volume_ml=0,
                        volume_minimo_alerta=450
                    )
                    db.session.add(inv)

            consent = PrivacyConsent(
                user_id=user.id,
                versao_politica='v1.0-2026',
                aceito=True,
                ip_address=request.remote_addr
            )
            db.session.add(consent)
            db.session.commit()

            record_audit('REGISTER_INSTITUTION', 'Institution', inst.id, actor_id=user.id, actor_type='INSTITUTION_ADMIN')
            flash('Cadastro da clínica efetuado com sucesso! Faça seu login.', 'success')
            return redirect(url_for('auth.login'))
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao registrar instituição: {str(e)}', 'danger')

    return render_template('auth/register_institution.html')

@auth_bp.route('/esqueci-senha', methods=['GET', 'POST'])
def forgot_password():
    sent = False
    email = ''
    if request.method == 'POST':
        email = request.form.get('email', '').strip().lower()
        if email:
            sent = True
            record_audit('PASSWORD_RESET_REQUEST', 'User', 0, actor_type='ANONYMOUS', after={'email': email})
            flash('Se o e-mail estiver cadastrado, as instruções foram enviadas!', 'info')
    return render_template('auth/esqueci_senha.html', sent=sent, email=email)
