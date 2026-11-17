from flask import Blueprint, render_template, request, flash, redirect, url_for, g, abort
from flask_login import login_required, current_user
from doepet_flask_mysql.models import db, AuditLog, Voucher
from datetime import datetime, timezone

audit_bp = Blueprint('audit', __name__)

@audit_bp.route('/')
@login_required
def index():
    # Visualização de auditoria e conformidade LGPD
    logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(50).all()
    return render_template('shared/auditoria.html', logs=logs)

@audit_bp.route('/resgatar-voucher', methods=['POST'])
@login_required
def resgatar_voucher():
    if current_user.role not in ['INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE']:
        abort(403)

    codigo = request.form.get('codigo', '').strip().upper()
    voucher = Voucher.query.filter_by(codigo=codigo).first()

    if not voucher:
        flash('Código de voucher inválido.', 'danger')
        return redirect(request.referrer or url_for('institution.dashboard'))

    # Regra RN12: Voucher expirado não pode ser utilizado
    if voucher.status == 'RESGATADO':
        flash('Aviso: Este voucher já foi utilizado anteriormente.', 'warning')
        return redirect(request.referrer or url_for('institution.dashboard'))

    if voucher.data_validade < datetime.now(timezone.utc):
        voucher.status = 'EXPIRADO'
        db.session.commit()
        flash('Aviso: Este voucher ultrapassou a data limite de validade e não pode ser resgatado.', 'danger')
        return redirect(request.referrer or url_for('institution.dashboard'))

    voucher.status = 'RESGATADO'
    voucher.resgatado_em = datetime.now(timezone.utc)
    db.session.commit()

    corr = getattr(g, 'correlation_id', 'direct')
    audit = AuditLog(
        actor_id=current_user.id,
        actor_type=current_user.role,
        action='REDEEM_VOUCHER',
        resource_type='Voucher',
        resource_id=str(voucher.id),
        correlation_id=corr,
        after_data={'codigo': voucher.codigo, 'beneficio': voucher.beneficio_descricao}
    )
    db.session.add(audit)
    db.session.commit()

    flash(f'Sucesso! Voucher {voucher.codigo} resgatado: {voucher.beneficio_descricao}', 'success')
    return redirect(request.referrer or url_for('institution.dashboard'))
