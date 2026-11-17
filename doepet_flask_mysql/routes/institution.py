from flask import Blueprint, render_template, request, redirect, url_for, flash, g, abort
from flask_login import login_required, current_user
from datetime import datetime, date, timedelta, timezone
from doepet_flask_mysql.models import (
    db, Institution, InstitutionEmployee, BloodInventory, BloodInventoryMovement,
    BloodNeed, NeedNotification, DonorInterest, Appointment, Donation, Voucher, Pet, Tutor, AuditLog, User
)
import uuid

institution_bp = Blueprint('institution', __name__)

def get_current_institution():
    if current_user.role == 'INSTITUTION_ADMIN':
        return Institution.query.filter_by(user_id=current_user.id).first()
    elif current_user.role == 'INSTITUTION_EMPLOYEE':
        emp = InstitutionEmployee.query.filter_by(user_id=current_user.id).first()
        return emp.institution if emp else None
    return None

def check_permission():
    if current_user.role not in ['INSTITUTION_ADMIN', 'INSTITUTION_EMPLOYEE']:
        abort(403)
    inst = get_current_institution()
    if not inst:
        abort(404)
    return inst

def record_audit(action, res_type, res_id, before=None, after=None):
    corr = getattr(g, 'correlation_id', 'direct')
    audit = AuditLog(
        actor_id=current_user.id,
        actor_type=current_user.role,
        action=action,
        resource_type=res_type,
        resource_id=str(res_id),
        correlation_id=corr,
        before_data=before,
        after_data=after,
        ip_address=request.remote_addr
    )
    db.session.add(audit)
    db.session.commit()

@institution_bp.route('/dashboard')
@login_required
def dashboard():
    inst = check_permission()
    estoques = BloodInventory.query.filter_by(institution_id=inst.id).all()
    canino_volume = sum(e.volume_ml for e in estoques if e.especie == 'CANINA')
    felino_volume = sum(e.volume_ml for e in estoques if e.especie == 'FELINA')
    total_volume = canino_volume + felino_volume
    alertas_ativos = BloodNeed.query.filter_by(institution_id=inst.id, status='ACTIVE').count()
    agendamentos_hoje = Appointment.query.filter(
        Appointment.institution_id == inst.id,
        db.func.date(Appointment.data_hora) == date.today()
    ).count()
    doacoes_mes = Donation.query.filter_by(institution_id=inst.id).count()

    proximos_agendamentos = Appointment.query.filter(
        Appointment.institution_id == inst.id,
        Appointment.status.in_(['SCHEDULED', 'CONFIRMED'])
    ).order_by(Appointment.data_hora.asc()).limit(5).all()

    return render_template(
        'institution/dashboard.html',
        institution=inst,
        estoques=estoques,
        total_volume=total_volume,
        canino_volume=canino_volume,
        felino_volume=felino_volume,
        alertas_ativos=alertas_ativos,
        agendamentos_hoje=agendamentos_hoje,
        doacoes_mes=doacoes_mes,
        proximos_agendamentos=proximos_agendamentos
    )

@institution_bp.route('/estoque', methods=['GET', 'POST'])
@login_required
def estoque():
    inst = check_permission()
    
    if request.method == 'POST':
        # Transação de Movimentação de Estoque
        inventory_id = int(request.form.get('inventory_id'))
        tipo_movimento = request.form.get('tipo_movimento')
        volume_delta = int(request.form.get('volume_delta_ml', 0))
        motivo = request.form.get('motivo', '').strip()
        lote = request.form.get('lote_codigo', '').strip()

        inv = BloodInventory.query.filter_by(id=inventory_id, institution_id=inst.id).first()
        if not inv:
            flash('Estoque não localizado.', 'danger')
            return redirect(url_for('institution.estoque'))

        volume_anterior = inv.volume_ml
        
        # Validação de validade máxima de 40 dias para entradas de sangue (Norma CPDA-1)
        data_coleta_str = request.form.get('data_coleta')
        if tipo_movimento == 'ENTRADA_DOACAO':
            from datetime import datetime, timedelta
            if data_coleta_str:
                data_coleta = datetime.strptime(data_coleta_str, '%Y-%m-%d').date()
            else:
                data_coleta = datetime.utcnow().date()
            data_validade = data_coleta + timedelta(days=40)
            if not lote:
                lote = f"LOT-{data_coleta.strftime('%Y%m%d')}-{inv.tipoSanguineo if hasattr(inv, 'tipoSanguineo') else 'BOLSA'}"
            motivo = f"{motivo} [Coleta: {data_coleta.strftime('%d/%m/%Y')} | Validade 40d: {data_validade.strftime('%d/%m/%Y')}]"

        # Validar delta
        if tipo_movimento in ['SAIDA_TRANSFUSAO', 'SAIDA_VENCIMENTO']:
            if volume_delta > 0:
                volume_delta = -volume_delta

        novo_volume = volume_anterior + volume_delta

        # Estoque não pode assumir volume negativo
        if novo_volume < 0:
            flash('Erro de Validação: O volume de estoque não pode ficar negativo!', 'danger')
            return redirect(url_for('institution.estoque'))

        try:
            inv.volume_ml = novo_volume
            mov = BloodInventoryMovement(
                inventory_id=inv.id,
                tipo_movimento=tipo_movimento,
                volume_delta_ml=volume_delta,
                volume_anterior_ml=volume_anterior,
                volume_posterior_ml=novo_volume,
                motivo=motivo,
                lote_codigo=lote,
                realizado_por_user_id=current_user.id
            )
            db.session.add(mov)
            db.session.commit()

            record_audit('UPDATE_STOCK', 'BloodInventory', inv.id, 
                         before={'volume_ml': volume_anterior}, 
                         after={'volume_ml': novo_volume, 'delta': volume_delta, 'lote': lote})
            flash('Movimentação de estoque registrada com sucesso! Prazo máximo de 40 dias de conservação registrado.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Erro transacional ao atualizar estoque: {str(e)}', 'danger')

        return redirect(url_for('institution.estoque'))

    inventarios = BloodInventory.query.filter_by(institution_id=inst.id).all()
    movimentacoes = BloodInventoryMovement.query.join(BloodInventory).filter(
        BloodInventory.institution_id == inst.id
    ).order_by(BloodInventoryMovement.created_at.desc()).limit(20).all()

    return render_template('institution/estoque.html', institution=inst, inventarios=inventarios, movimentacoes=movimentacoes)

@institution_bp.route('/alertas', methods=['GET', 'POST'])
@login_required
def alertas():
    inst = check_permission()

    if request.method == 'POST':
        # Requisito US05 / RF05: Criar Alerta de Necessidade
        especie = request.form.get('especie')
        tipo_sanguineo = request.form.get('tipo_sanguineo')
        volume_ml = int(request.form.get('volume_solicitado_ml', 450))
        urgencia = request.form.get('urgencia', 'ALTA')
        descricao = request.form.get('descricao', '').strip()

        try:
            need = BloodNeed(
                institution_id=inst.id,
                especie=especie,
                tipo_sanguineo=tipo_sanguineo,
                volume_solicitado_ml=volume_ml,
                urgencia=urgencia,
                status='ACTIVE',
                descricao=descricao
            )
            db.session.add(need)
            db.session.flush()

            # Requisito US06 / RN07: Disparar Notificação aos tutores elegíveis
            # Busca pets da mesma espécie, com status APTO
            pets_elegiveis = Pet.query.filter_by(especie=especie, status_elegibilidade='APTO').all()
            notificados_count = 0

            for pet in pets_elegiveis:
                # Regra RN07: Somente usuários elegíveis recebem
                notif = NeedNotification(
                    need_id=need.id,
                    tutor_id=pet.tutor_id,
                    pet_id=pet.id,
                    canal='PUSH',
                    status='SENT',
                    mensagem=f"DoePet Urgente: {inst.nome_fantasia} necessita de sangue {especie} ({tipo_sanguineo}). Seu pet {pet.nome} pode salvar vidas!"
                )
                db.session.add(notif)
                notificados_count += 1

            db.session.commit()
            record_audit('CREATE_BLOOD_NEED', 'BloodNeed', need.id, after={'especie': especie, 'notificados': notificados_count})
            flash(f'Alerta de urgência publicado! {notificados_count} tutores compatíveis foram notificados via push.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao emitir alerta: {str(e)}', 'danger')

        return redirect(url_for('institution.alertas'))

    alertas_lista = BloodNeed.query.filter_by(institution_id=inst.id).order_by(BloodNeed.created_at.desc()).all()
    return render_template('institution/alertas.html', institution=inst, alertas=alertas_lista)

@institution_bp.route('/agendamentos')
@login_required
def agendamentos():
    inst = check_permission()
    appointments = Appointment.query.filter_by(institution_id=inst.id).order_by(Appointment.data_hora.asc()).all()
    interesses = DonorInterest.query.join(BloodNeed).filter(
        BloodNeed.institution_id == inst.id,
        DonorInterest.status == 'MANIFESTADO'
    ).all()
    return render_template('institution/agendamentos.html', institution=inst, appointments=appointments, interesses=interesses)

@institution_bp.route('/agendar-interesse/<int:interest_id>', methods=['GET', 'POST'])
@login_required
def agendar_interesse(interest_id):
    inst = check_permission()
    interest = DonorInterest.query.get_or_404(interest_id)
    slot_texto = request.form.get('slot_hora', request.args.get('slot_hora', 'Amanhã às 10:00'))
    slot_codigo = f"SLOT-{interest.pet.especie[:3].upper()}-{uuid.uuid4().hex[:4].upper()}"

    app = Appointment(
        institution_id=inst.id,
        tutor_id=interest.tutor_id,
        pet_id=interest.pet_id,
        slot_codigo=slot_codigo,
        data_hora=datetime.now() + timedelta(days=1),
        status='SCHEDULED'
    )
    interest.status = 'SELECIONADO_AGENDAMENTO'
    db.session.add(app)
    db.session.commit()

    record_audit('CREATE_APPOINTMENT', 'Appointment', app.id, after={'slot': slot_codigo, 'pet': interest.pet.nome})
    flash(f'Agendamento confirmado para o pet {interest.pet.nome}! Horário reservado na clínica com sucesso.', 'success')
    return redirect(url_for('institution.agendamentos'))

@institution_bp.route('/confirmar-doacao/<int:appointment_id>', methods=['POST'])
@login_required
def confirmar_doacao(appointment_id):
    inst = check_permission()
    app = Appointment.query.filter_by(id=appointment_id, institution_id=inst.id).first_or_404()

    # Requisito US09: Confirmar comparecimento e doação
    crmv = request.form.get('veterinario_crmv', inst.crmv_responsavel)
    volume_coletado = int(request.form.get('volume_coletado_ml', 450))
    hematocrito = float(request.form.get('hematocrito', 42.0))
    peso_aferido = float(request.form.get('peso_aferido', app.pet.peso_kg))
    tipo_confirmado = request.form.get('tipo_sanguineo_confirmado', app.pet.tipo_sanguineo)
    observacoes = request.form.get('observacoes', '')

    # Regra RN15: Triagem clínica veterinária
    if hematocrito < 37.0:
        flash('Triagem reprovada: Hematócrito abaixo do limite de segurança clínica (< 37%). Doação suspensa.', 'danger')
        return redirect(url_for('institution.agendamentos'))

    try:
        lote_codigo = f"BOLSA-{inst.id}-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        validade = date.today() + timedelta(days=35) # Sangue canino/felino refrigerado

        # 1. Registrar Doação
        donation = Donation(
            appointment_id=app.id,
            institution_id=inst.id,
            tutor_id=app.tutor_id,
            pet_id=app.pet_id,
            veterinario_responsavel_crmv=crmv,
            volume_coletado_ml=volume_coletado,
            lote_bolsa=lote_codigo,
            data_validade_bolsa=validade,
            tipo_sanguineo_confirmado=tipo_confirmado,
            hematocrito_pre_doacao=hematocrito,
            peso_aferido_kg=peso_aferido,
            aprovado_triagem=True,
            observacoes_clinicas=observacoes
        )
        db.session.add(donation)
        db.session.flush()

        # 2. Atualizar status do agendamento
        app.status = 'ATTENDED'

        # 3. Atualizar estoque transacional (US04)
        inv = BloodInventory.query.filter_by(
            institution_id=inst.id,
            especie=app.pet.especie,
            tipo_sanguineo=tipo_confirmado
        ).first()

        if inv:
            vol_ant = inv.volume_ml
            inv.volume_ml += volume_coletado
            mov = BloodInventoryMovement(
                inventory_id=inv.id,
                tipo_movimento='ENTRADA_DOACAO',
                volume_delta_ml=volume_coletado,
                volume_anterior_ml=vol_ant,
                volume_posterior_ml=inv.volume_ml,
                motivo=f"Doação realizada pelo pet {app.pet.nome} (Lote: {lote_codigo})",
                lote_codigo=lote_codigo,
                realizado_por_user_id=current_user.id
            )
            db.session.add(mov)

        # 4. Atualizar pet (última doação + período de carência)
        app.pet.ultima_doacao_em = date.today()
        app.pet.tipo_sanguineo = tipo_confirmado

        # 5. Requisito US10 / RF10: Gerar Voucher único de benefício
        voucher_code = f"DOEPET-{uuid.uuid4().hex[:8].upper()}"
        voucher = Voucher(
            donation_id=donation.id,
            tutor_id=app.tutor_id,
            institution_id=inst.id,
            codigo=voucher_code,
            beneficio_descricao="Check-up Clínico Preventivo Gratuito + Isenção Vacinal",
            data_validade=datetime.now(timezone.utc) + timedelta(days=180),
            status='ATIVO'
        )
        db.session.add(voucher)

        db.session.commit()
        record_audit('CONFIRM_DONATION', 'Donation', donation.id, after={'volume_ml': volume_coletado, 'voucher': voucher_code})
        flash(f'Doação de {volume_coletado}mL registrada com sucesso! Lote: {lote_codigo}. Voucher gerado: {voucher_code}.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao registrar doação: {str(e)}', 'danger')

    return redirect(url_for('institution.agendamentos'))

@institution_bp.route('/funcionarios', methods=['GET', 'POST'])
@login_required
def funcionarios():
    inst = check_permission()
    if current_user.role != 'INSTITUTION_ADMIN':
        flash('Somente o administrador da instituição tem acesso à gestão de funcionários.', 'warning')
        return redirect(url_for('institution.dashboard'))

    if request.method == 'POST':
        # Requisito US13 / RF13
        email = request.form.get('email', '').strip().lower()
        senha = request.form.get('password', '')
        nome = request.form.get('nome', '').strip()
        cpf = request.form.get('cpf', '').strip()
        cargo = request.form.get('cargo', '').strip()
        crmv = request.form.get('crmv', '').strip()

        if User.query.filter_by(email=email).first():
            flash('E-mail já utilizado na plataforma.', 'danger')
            return redirect(url_for('institution.funcionarios'))

        try:
            usr = User(email=email, role='INSTITUTION_EMPLOYEE')
            usr.set_password(senha)
            db.session.add(usr)
            db.session.flush()

            emp = InstitutionEmployee(
                user_id=usr.id,
                institution_id=inst.id,
                nome=nome,
                cpf=cpf,
                cargo=cargo,
                crmv=crmv,
                is_admin=False,
                is_active=True
            )
            db.session.add(emp)
            db.session.commit()

            record_audit('CREATE_EMPLOYEE', 'InstitutionEmployee', emp.id, after={'nome': nome, 'cargo': cargo})
            flash(f'Funcionário {nome} cadastrado com sucesso!', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao cadastrar funcionário: {str(e)}', 'danger')

    equipe = InstitutionEmployee.query.filter_by(institution_id=inst.id).all()
    return render_template('institution/funcionarios.html', institution=inst, equipe=equipe)

@institution_bp.route('/funcionarios/<int:emp_id>/editar', methods=['POST'])
@login_required
def editar_funcionario(emp_id):
    inst = check_permission()
    if current_user.role != 'INSTITUTION_ADMIN':
        flash('Acesso não autorizado.', 'danger')
        return redirect(url_for('institution.funcionarios'))

    emp = InstitutionEmployee.query.filter_by(id=emp_id, institution_id=inst.id).first_or_404()
    nome = request.form.get('nome', '').strip()
    cpf = request.form.get('cpf', '').strip()
    cargo = request.form.get('cargo', '').strip()
    crmv = request.form.get('crmv', '').strip()
    is_active = request.form.get('is_active') == 'true'

    try:
        dados_anteriores = {'nome': emp.nome, 'cargo': emp.cargo, 'is_active': emp.is_active}
        emp.nome = nome
        emp.cpf = cpf
        emp.cargo = cargo
        emp.crmv = crmv
        emp.is_active = is_active
        db.session.commit()

        record_audit('UPDATE_EMPLOYEE', 'InstitutionEmployee', emp.id, 
                     before=dados_anteriores, 
                     after={'nome': nome, 'cargo': cargo, 'is_active': is_active})
        flash(f'Dados do colaborador {nome} atualizados com sucesso!', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao atualizar colaborador: {str(e)}', 'danger')

    return redirect(url_for('institution.funcionarios'))

@institution_bp.route('/funcionarios/<int:emp_id>/remover', methods=['POST'])
@login_required
def remover_funcionario(emp_id):
    inst = check_permission()
    if current_user.role != 'INSTITUTION_ADMIN':
        flash('Acesso não autorizado.', 'danger')
        return redirect(url_for('institution.funcionarios'))

    emp = InstitutionEmployee.query.filter_by(id=emp_id, institution_id=inst.id).first_or_404()

    # Prevenir exclusão do próprio administrador principal
    if emp.is_admin:
        outros_admins = InstitutionEmployee.query.filter(
            InstitutionEmployee.institution_id == inst.id,
            InstitutionEmployee.id != emp.id,
            InstitutionEmployee.is_admin == True,
            InstitutionEmployee.is_active == True
        ).count()
        if outros_admins == 0:
            flash('Não é permitido remover o único administrador ativo da instituição.', 'warning')
            return redirect(url_for('institution.funcionarios'))

    try:
        nome = emp.nome
        db.session.delete(emp)
        db.session.commit()
        record_audit('DELETE_EMPLOYEE', 'InstitutionEmployee', emp_id, before={'nome': nome})
        flash(f'Colaborador {nome} removido com sucesso da equipe!', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao remover colaborador: {str(e)}', 'danger')

    return redirect(url_for('institution.funcionarios'))
