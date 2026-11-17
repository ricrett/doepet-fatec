from flask import Blueprint, render_template, request, redirect, url_for, flash, g, abort, jsonify, Response
from flask_login import login_required, current_user
from datetime import datetime, date
from decimal import Decimal
import json
from doepet_flask_mysql.models import (
    db, Tutor, Pet, BloodNeed, NeedNotification, DonorInterest, Appointment, Voucher, AuditLog
)

tutor_bp = Blueprint('tutor', __name__)

def get_current_tutor():
    if current_user.role != 'TUTOR':
        abort(403)
    tutor = Tutor.query.filter_by(user_id=current_user.id).first()
    if not tutor:
        abort(404)
    return tutor

def record_audit(action, res_type, res_id, before=None, after=None):
    corr = getattr(g, 'correlation_id', 'direct')
    audit = AuditLog(
        actor_id=current_user.id,
        actor_type='TUTOR',
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

@tutor_bp.route('/dashboard')
@login_required
def dashboard():
    tutor = get_current_tutor()
    pets = Pet.query.filter_by(tutor_id=tutor.id).all()
    
    # Notificações e Alertas compatíveis (US06)
    notificacoes = NeedNotification.query.filter_by(tutor_id=tutor.id).order_by(NeedNotification.sent_at.desc()).limit(10).all()
    
    # Alertas ativos compatíveis com os pets do tutor
    especies_tutor = list(set([p.especie for p in pets]))
    alertas_compativeis = []
    if especies_tutor:
        alertas_compativeis = BloodNeed.query.filter(
            BloodNeed.status == 'ACTIVE',
            BloodNeed.especie.in_(especies_tutor)
        ).order_by(BloodNeed.urgencia.asc()).all()

    meus_interesses = DonorInterest.query.filter_by(tutor_id=tutor.id).all()
    interesses_need_ids = [i.need_id for i in meus_interesses]

    meus_agendamentos = Appointment.query.filter_by(tutor_id=tutor.id).order_by(Appointment.data_hora.desc()).all()
    meus_vouchers = Voucher.query.filter_by(tutor_id=tutor.id).order_by(Voucher.created_at.desc()).all()

    # Cálculo exclusivo de volume disponível para doação conforme os pets aptos do tutor
    caes_aptos = [p for p in pets if p.especie == 'CANINA' and p.status_elegibilidade == 'APTO']
    gatos_aptos = [p for p in pets if p.especie == 'FELINA' and p.status_elegibilidade == 'APTO']
    volume_caes_ml = len(caes_aptos) * 450
    volume_gatos_ml = len(gatos_aptos) * 50
    volume_total_doacao_ml = volume_caes_ml + volume_gatos_ml

    return render_template(
        'tutor/dashboard.html',
        tutor=tutor,
        pets=pets,
        notificacoes=notificacoes,
        alertas_compativeis=alertas_compativeis,
        interesses_need_ids=interesses_need_ids,
        meus_agendamentos=meus_agendamentos,
        meus_vouchers=meus_vouchers,
        volume_total_doacao_ml=volume_total_doacao_ml,
        volume_caes_ml=volume_caes_ml,
        volume_gatos_ml=volume_gatos_ml,
        qtd_caes_aptos=len(caes_aptos),
        qtd_gatos_aptos=len(gatos_aptos)
    )

@tutor_bp.route('/pets', methods=['GET', 'POST'])
@login_required
def pets():
    tutor = get_current_tutor()

    if request.method == 'POST':
        # Requisito US03: Cadastro do animal
        nome = request.form.get('nome', '').strip()
        especie = request.form.get('especie') # CANINA / FELINA
        raca = request.form.get('raca', '').strip()
        sexo = request.form.get('sexo')
        nascimento_str = request.form.get('data_nascimento')
        peso = float(request.form.get('peso_kg', 0.0))
        tipo_sanguineo = request.form.get('tipo_sanguineo', 'DESCONHECIDO')
        castrado = request.form.get('castrado') == 'on'
        vacinado = request.form.get('vacinado') == 'on'
        vermifugado = request.form.get('vermifugado') == 'on'
        obs = request.form.get('observacoes', '').strip()

        # Regra de Elegibilidade Prévia (Critérios Médicos Veterinários)
        # Cães: >= 25kg, Gatos: >= 4kg
        status_elegivel = 'EM_ANALISE'
        if especie == 'CANINA' and peso >= 25.0 and vacinado and vermifugado:
            status_elegivel = 'APTO'
        elif especie == 'FELINA' and peso >= 4.0 and vacinado and vermifugado:
            status_elegivel = 'APTO'
        elif peso < 3.0:
            status_elegivel = 'INAPTO_TEMPORARIO'

        try:
            dt_nasc = datetime.strptime(nascimento_str, '%Y-%m-%d').date()
            pet = Pet(
                tutor_id=tutor.id,
                nome=nome,
                especie=especie,
                raca=raca,
                sexo=sexo,
                data_nascimento=dt_nasc,
                peso_kg=Decimal(str(peso)),
                tipo_sanguineo=tipo_sanguineo,
                castrado=castrado,
                vacinado_em_dia=vacinado,
                vermifugado_em_dia=vermifugado,
                status_elegibilidade=status_elegivel,
                observacoes=obs
            )
            db.session.add(pet)
            db.session.commit()

            record_audit('REGISTER_PET', 'Pet', pet.id, after={'nome': nome, 'especie': especie, 'status': status_elegivel})
            flash(f'Pet {nome} cadastrado com sucesso! Status inicial: {status_elegivel}.', 'success')
        except Exception as e:
            db.session.rollback()
            flash(f'Erro ao cadastrar animal: {str(e)}', 'danger')

        return redirect(url_for('tutor.pets'))

    pets_list = Pet.query.filter_by(tutor_id=tutor.id).all()
    return render_template('tutor/pets.html', tutor=tutor, pets=pets_list)

@tutor_bp.route('/pets/<int:pet_id>/excluir', methods=['POST'])
@login_required
def excluir_pet(pet_id):
    tutor = get_current_tutor()
    pet = Pet.query.filter_by(id=pet_id, tutor_id=tutor.id).first_or_404()
    nome = pet.nome
    try:
        DonorInterest.query.filter_by(pet_id=pet.id).delete()
        db.session.delete(pet)
        db.session.commit()
        record_audit('DELETE_PET', 'Pet', pet_id, before={'nome': nome, 'especie': pet.especie})
        flash(f'Pet "{nome}" foi excluído com sucesso do seu cadastro.', 'info')
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao excluir animal: {str(e)}', 'danger')

    next_url = request.referrer or url_for('tutor.pets')
    return redirect(next_url)

@tutor_bp.route('/manifestar-interesse/<int:need_id>', methods=['POST'])
@login_required
def manifestar_interesse(need_id):
    tutor = get_current_tutor()
    need = BloodNeed.query.get_or_404(need_id)
    pet_id = int(request.form.get('pet_id'))

    pet = Pet.query.filter_by(id=pet_id, tutor_id=tutor.id).first_or_404()

    # Validar se o pet é da mesma espécie do alerta
    if pet.especie != need.especie:
        flash(f'Espécie do pet ({pet.especie}) incompatível com a necessidade ({need.especie}).', 'danger')
        return redirect(url_for('tutor.dashboard'))

    # Requisito US07 / RF07: Manifestar interesse
    existente = DonorInterest.query.filter_by(need_id=need.id, pet_id=pet.id).first()
    if existente:
        flash('Interesse já registrado para este pet neste alerta.', 'info')
        return redirect(url_for('tutor.dashboard'))

    try:
        interesse = DonorInterest(
            need_id=need.id,
            tutor_id=tutor.id,
            pet_id=pet.id,
            status='MANIFESTADO',
            observacao_tutor=request.form.get('observacao', 'Disponível para doação imediata')
        )
        db.session.add(interesse)
        db.session.commit()

        record_audit('EXPRESS_INTEREST', 'DonorInterest', interesse.id, after={'need_id': need.id, 'pet_id': pet.id})
        flash(f'Obrigado! Seu interesse em levar o(a) {pet.nome} foi enviado à clínica veterinária com sucesso.', 'success')
    except Exception as e:
        db.session.rollback()
        flash(f'Erro ao registrar interesse: {str(e)}', 'danger')

    return redirect(url_for('tutor.dashboard'))

@tutor_bp.route('/exportar-dados-lgpd')
@login_required
def exportar_dados_lgpd():
    # LGPD Artigo 18 - Direito de Portabilidade e Acesso aos Dados do Titular
    tutor = get_current_tutor()
    pets = Pet.query.filter_by(tutor_id=tutor.id).all()
    vouchers = Voucher.query.filter_by(tutor_id=tutor.id).all()

    dados = {
        'titular': {
            'nome': tutor.nome,
            'cpf': tutor.cpf,
            'email': current_user.email,
            'telefone': tutor.telefone,
            'cidade': tutor.cidade,
            'estado': tutor.estado,
            'criado_em': str(tutor.created_at)
        },
        'animais_cadastrados': [
            {
                'id': p.id,
                'nome': p.nome,
                'especie': p.especie,
                'raca': p.raca,
                'peso_kg': float(p.peso_kg),
                'tipo_sanguineo': p.tipo_sanguineo,
                'status_elegibilidade': p.status_elegibilidade
            } for p in pets
        ],
        'vouchers_beneficios': [
            {
                'codigo': v.codigo,
                'beneficio': v.beneficio_descricao,
                'validade': str(v.data_validade),
                'status': v.status
            } for v in vouchers
        ],
        'lgpd_compliance': {
            'politica_versao': 'v1.0-2026',
            'gerado_em': datetime.now().isoformat(),
            'lei_aplicavel': 'Lei Geral de Proteção de Dados (Lei 13.709/2018)'
        }
    }

    record_audit('LGPD_DATA_EXPORT', 'Tutor', tutor.id)
    return Response(
        json.dumps(dados, indent=2, ensure_ascii=False),
        mimetype='application/json',
        headers={'Content-Disposition': 'attachment;filename=doepet_meus_dados_lgpd.json'}
    )
