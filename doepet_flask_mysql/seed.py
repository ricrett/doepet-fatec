from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import uuid

from doepet_flask_mysql.models import (
    db,
    User,
    Institution,
    InstitutionEmployee,
    Tutor,
    Pet,
    BloodInventory,
    BloodBag,
    BloodInventoryMovement,
    BloodNeed,
    NeedNotification,
    DonorInterest,
    Appointment,
    Donation,
    Voucher,
    AuditLog,
    PrivacyConsent,
)


def _seed_lock_acquire():
    if db.engine.dialect.name == 'postgresql':
        db.session.execute(db.text('SELECT pg_advisory_lock(8421002)'))


def _seed_lock_release():
    if db.engine.dialect.name == 'postgresql':
        try:
            db.session.execute(db.text('SELECT pg_advisory_unlock(8421002)'))
            db.session.commit()
        except Exception:
            db.session.rollback()


def seed_database(force: bool = False) -> bool:
    """Popula o banco de dados de forma idempotente caso esteja vazio."""
    _seed_lock_acquire()
    try:
        if not force and User.query.first() is not None:
            return False

        return _perform_seed()
    finally:
        _seed_lock_release()


def _perform_seed() -> bool:

    # 1. Usuários base (Tutores + Clínicas)
    u_clinic1 = User(email='urgencias@hemovetcentral.com.br', role='INSTITUTION_ADMIN', is_active=True)
    u_clinic1.set_password('doepet123')

    u_clinic2 = User(email='contato@petlifehemo.com.br', role='INSTITUTION_ADMIN', is_active=True)
    u_clinic2.set_password('doepet123')

    u_emp2 = User(email='leonardo.braga@hemovetcentral.com.br', role='INSTITUTION_EMPLOYEE', is_active=True)
    u_emp2.set_password('doepet123')

    u_emp3 = User(email='juliana.prado@hemovetcentral.com.br', role='INSTITUTION_EMPLOYEE', is_active=True)
    u_emp3.set_password('doepet123')

    u_tutor1 = User(email='ricardo.santos@doepet.com.br', role='TUTOR', is_active=True)
    u_tutor1.set_password('doepet123')

    u_tutor2 = User(email='ana.clara@doepet.com.br', role='TUTOR', is_active=True)
    u_tutor2.set_password('doepet123')

    db.session.add_all([u_clinic1, u_clinic2, u_emp2, u_emp3, u_tutor1, u_tutor2])
    db.session.flush()

    # 2. Instituições
    inst1 = Institution(
        user_id=u_clinic1.id,
        cnpj='12.345.678/0001-90',
        razao_social='Hospital e Hemocentro Veterinário São Paulo LTDA',
        nome_fantasia='Hemovet Central 24h',
        crmv_responsavel='CRMV-SP 18452 (Dra. Camila Nogueira)',
        telefone='(11) 3456-7890',
        email_contato='urgencias@hemovetcentral.com.br',
        cep='01310-100',
        endereco='Av. Paulista, 1500 - Bela Vista',
        cidade='São Paulo',
        estado='SP',
        capacidade_diaria=12,
        status='ACTIVE',
    )
    inst2 = Institution(
        user_id=u_clinic2.id,
        cnpj='98.765.432/0001-11',
        razao_social='Clínica e Banco de Sangue Animal Rio LTDA',
        nome_fantasia='PetLife Hemoterapia',
        crmv_responsavel='CRMV-RJ 09321 (Dr. Marcos Vinicius)',
        telefone='(21) 2233-4455',
        email_contato='contato@petlifehemo.com.br',
        cep='22041-001',
        endereco='Av. Atlântica, 400 - Copacabana',
        cidade='Rio de Janeiro',
        estado='RJ',
        capacidade_diaria=8,
        status='ACTIVE',
    )
    db.session.add_all([inst1, inst2])
    db.session.flush()

    # 3. Equipe da Clínica 1
    emp1 = InstitutionEmployee(
        user_id=u_clinic1.id,
        institution_id=inst1.id,
        nome='Dra. Camila Nogueira',
        cpf='123.456.789-00',
        cargo='Diretora Clínica & Hemoterapeuta',
        crmv='CRMV-SP 18452',
        email='urgencias@hemovetcentral.com.br',
        is_admin=True,
        is_active=True,
    )
    emp2 = InstitutionEmployee(
        user_id=u_emp2.id,
        institution_id=inst1.id,
        nome='Dr. Leonardo Braga',
        cpf='234.567.890-11',
        cargo='Médico Veterinário Coletor',
        crmv='CRMV-SP 23114',
        email='leonardo.braga@hemovetcentral.com.br',
        is_admin=False,
        is_active=True,
    )
    emp3 = InstitutionEmployee(
        user_id=u_emp3.id,
        institution_id=inst1.id,
        nome='Juliana Prado',
        cpf='345.678.901-22',
        cargo='Enfermeira Veterinária / Triagem',
        crmv=None,
        email='juliana.prado@hemovetcentral.com.br',
        is_admin=False,
        is_active=True,
    )
    emp_inst2 = InstitutionEmployee(
        user_id=u_clinic2.id,
        institution_id=inst2.id,
        nome='Dr. Marcos Vinicius',
        cpf='555.666.777-88',
        cargo='Responsável Técnico',
        crmv='CRMV-RJ 09321',
        email='contato@petlifehemo.com.br',
        is_admin=True,
        is_active=True,
    )
    db.session.add_all([emp1, emp2, emp3, emp_inst2])

    # 4. Tutores
    tutor1 = Tutor(
        user_id=u_tutor1.id,
        nome='Ricardo Santos (Você)',
        cpf='321.654.987-00',
        telefone='(11) 98765-4321',
        whatsapp='(11) 98765-4321',
        cep='04077-000',
        cidade='São Paulo',
        estado='SP',
        bairro='Moema',
        notif_push=True,
        notif_whatsapp=True,
        lgpd_aceito=True,
        lgpd_versao='v1.0-2026',
        data_aceite=datetime(2026, 3, 15, 10, 30, tzinfo=timezone.utc),
    )
    tutor2 = Tutor(
        user_id=u_tutor2.id,
        nome='Ana Clara Albuquerque',
        cpf='456.789.123-44',
        telefone='(11) 97654-3210',
        whatsapp='(11) 97654-3210',
        cep='05422-000',
        cidade='São Paulo',
        estado='SP',
        bairro='Pinheiros',
        notif_push=True,
        notif_whatsapp=True,
        lgpd_aceito=True,
        lgpd_versao='v1.0-2026',
        data_aceite=datetime(2026, 3, 18, 14, 22, tzinfo=timezone.utc),
    )
    db.session.add_all([tutor1, tutor2])
    db.session.flush()

    # Consentimentos LGPD
    for u in [u_clinic1, u_clinic2, u_tutor1, u_tutor2]:
        db.session.add(PrivacyConsent(user_id=u.id, versao_politica='v1.0-2026', aceito=True))

    # 5. Pets
    pet1 = Pet(
        tutor_id=tutor1.id,
        nome='Zeus',
        especie='CANINA',
        raca='Golden Retriever',
        sexo='MACHO',
        data_nascimento=date(2023, 4, 15),
        peso_kg=Decimal('32.50'),
        tipo_sanguineo='DEA 1.1 Negativo (Doador Universal)',
        castrado=True,
        vacinado_em_dia=True,
        vermifugado_em_dia=True,
        status_elegibilidade='APTO',
        ultima_doacao_em=date(2026, 1, 10),
        observacoes='Excelente temperamento dócil, jugular bem acessível.',
    )
    pet2 = Pet(
        tutor_id=tutor1.id,
        nome='Luna',
        especie='CANINA',
        raca='Pastor Alemão',
        sexo='FEMEA',
        data_nascimento=date(2022, 8, 10),
        peso_kg=Decimal('28.00'),
        tipo_sanguineo='DEA 1.1 Positivo',
        castrado=True,
        vacinado_em_dia=True,
        vermifugado_em_dia=True,
        status_elegibilidade='APTO',
        ultima_doacao_em=date(2025, 11, 4),
    )
    pet3 = Pet(
        tutor_id=tutor1.id,
        nome='Oliver',
        especie='FELINA',
        raca='Siamês',
        sexo='MACHO',
        data_nascimento=date(2024, 2, 20),
        peso_kg=Decimal('4.80'),
        tipo_sanguineo='Tipo A',
        castrado=True,
        vacinado_em_dia=True,
        vermifugado_em_dia=True,
        status_elegibilidade='APTO',
        observacoes='FIV/FeLV negativo em teste PCR.',
    )
    pet4 = Pet(
        tutor_id=tutor2.id,
        nome='Thor',
        especie='CANINA',
        raca='Rottweiler',
        sexo='MACHO',
        data_nascimento=date(2021, 6, 5),
        peso_kg=Decimal('44.00'),
        tipo_sanguineo='DEA 1.1 Negativo (Doador Universal)',
        castrado=True,
        vacinado_em_dia=True,
        vermifugado_em_dia=True,
        status_elegibilidade='APTO',
    )
    db.session.add_all([pet1, pet2, pet3, pet4])
    db.session.flush()

    # 6. Estoque de Sangue (Clínica 1 + Clínica 2 zerada)
    inv1 = BloodInventory(institution_id=inst1.id, especie='CANINA', tipo_sanguineo='DEA 1.1 Negativo', componente='SANGUE_TOTAL', volume_ml=450, volume_minimo_alerta=900)
    inv2 = BloodInventory(institution_id=inst1.id, especie='CANINA', tipo_sanguineo='DEA 1.1 Positivo', componente='SANGUE_TOTAL', volume_ml=1350, volume_minimo_alerta=900)
    inv3 = BloodInventory(institution_id=inst1.id, especie='CANINA', tipo_sanguineo='DEA 1.1 Negativo', componente='CONCENTRADO_HEMACIAS', volume_ml=600, volume_minimo_alerta=500)
    inv4 = BloodInventory(institution_id=inst1.id, especie='FELINA', tipo_sanguineo='Tipo A', componente='SANGUE_TOTAL', volume_ml=150, volume_minimo_alerta=250)
    inv5 = BloodInventory(institution_id=inst1.id, especie='FELINA', tipo_sanguineo='Tipo B (Raro)', componente='SANGUE_TOTAL', volume_ml=50, volume_minimo_alerta=100)

    inst2_invs = [
        BloodInventory(institution_id=inst2.id, especie='CANINA', tipo_sanguineo='DEA 1.1 Negativo', componente='SANGUE_TOTAL', volume_ml=450, volume_minimo_alerta=450),
        BloodInventory(institution_id=inst2.id, especie='CANINA', tipo_sanguineo='DEA 1.1 Positivo', componente='SANGUE_TOTAL', volume_ml=450, volume_minimo_alerta=450),
        BloodInventory(institution_id=inst2.id, especie='FELINA', tipo_sanguineo='Tipo A', componente='SANGUE_TOTAL', volume_ml=50, volume_minimo_alerta=150),
    ]
    db.session.add_all([inv1, inv2, inv3, inv4, inv5, *inst2_invs])
    db.session.flush()

    # 7. Bolsas individuais (Regra de 40 dias estritos pós-coleta)
    bags = [
        BloodBag(inventory_id=inv1.id, lote_codigo='BOLSA-CAN-20260923-01', volume_ml=450, data_coleta=date(2026, 9, 23), data_validade=date(2026, 11, 2), status='DISPONIVEL', doador_nome='Zeus', responsavel_crmv='CRMV-SP 18452'),
        BloodBag(inventory_id=inv2.id, lote_codigo='BOLSA-CAN-20260921-02', volume_ml=450, data_coleta=date(2026, 9, 21), data_validade=date(2026, 10, 31), status='DISPONIVEL', doador_nome='Thor', responsavel_crmv='CRMV-SP 18452'),
        BloodBag(inventory_id=inv2.id, lote_codigo='BOLSA-CAN-20261015-03', volume_ml=450, data_coleta=date(2026, 10, 15), data_validade=date(2026, 11, 24), status='DISPONIVEL', doador_nome='Luna', responsavel_crmv='CRMV-SP 21098'),
        BloodBag(inventory_id=inv2.id, lote_codigo='BOLSA-CAN-20261025-04', volume_ml=450, data_coleta=date(2026, 10, 25), data_validade=date(2026, 12, 4), status='DISPONIVEL', doador_nome='Apolo', responsavel_crmv='CRMV-SP 18452'),
        BloodBag(inventory_id=inv3.id, lote_codigo='BOLSA-CH-20261010-05', volume_ml=300, data_coleta=date(2026, 10, 10), data_validade=date(2026, 11, 19), status='DISPONIVEL', doador_nome='Zeus', responsavel_crmv='CRMV-SP 18452'),
        BloodBag(inventory_id=inv3.id, lote_codigo='BOLSA-CH-20261018-06', volume_ml=300, data_coleta=date(2026, 10, 18), data_validade=date(2026, 11, 27), status='DISPONIVEL', doador_nome='Max', responsavel_crmv='CRMV-SP 21098'),
        BloodBag(inventory_id=inv4.id, lote_codigo='BOLSA-FEL-20260922-07', volume_ml=50, data_coleta=date(2026, 9, 22), data_validade=date(2026, 11, 1), status='DISPONIVEL', doador_nome='Oliver', responsavel_crmv='CRMV-SP 18452'),
        BloodBag(inventory_id=inv4.id, lote_codigo='BOLSA-FEL-20261012-08', volume_ml=50, data_coleta=date(2026, 10, 12), data_validade=date(2026, 11, 21), status='DISPONIVEL', doador_nome='Milo', responsavel_crmv='CRMV-SP 18452'),
        BloodBag(inventory_id=inv4.id, lote_codigo='BOLSA-FEL-20261022-09', volume_ml=50, data_coleta=date(2026, 10, 22), data_validade=date(2026, 12, 1), status='DISPONIVEL', doador_nome='Simba', responsavel_crmv='CRMV-SP 21098'),
        BloodBag(inventory_id=inv5.id, lote_codigo='BOLSA-FEL-20261020-10', volume_ml=50, data_coleta=date(2026, 10, 20), data_validade=date(2026, 11, 29), status='DISPONIVEL', doador_nome='Luna Gata', responsavel_crmv='CRMV-SP 18452'),
    ]
    db.session.add_all(bags)

    # 8. Movimentações de Estoque
    mov1 = BloodInventoryMovement(
        inventory_id=inv1.id,
        tipo_movimento='SAIDA_TRANSFUSAO',
        volume_delta_ml=-450,
        volume_anterior_ml=900,
        volume_posterior_ml=450,
        motivo='Transfusão de emergência - Paciente atropelado (Hospital Veterinário)',
        lote_codigo='BOLSA-CAN-20260301-A',
        realizado_por_user_id=u_clinic1.id,
        realizado_por_nome='Dra. Camila Nogueira',
    )
    mov2 = BloodInventoryMovement(
        inventory_id=inv2.id,
        tipo_movimento='ENTRADA_DOACAO',
        volume_delta_ml=450,
        volume_anterior_ml=900,
        volume_posterior_ml=1350,
        motivo='Doação de sangue voluntária do pet Thor (Tutor: Ana Clara)',
        lote_codigo='BOLSA-CAN-20260318-B',
        realizado_por_user_id=u_emp2.id,
        realizado_por_nome='Dr. Leonardo Braga',
    )
    db.session.add_all([mov1, mov2])

    # 9. Alertas de Necessidade
    need1 = BloodNeed(
        institution_id=inst1.id,
        especie='CANINA',
        tipo_sanguineo='DEA 1.1 Negativo (Universal)',
        volume_solicitado_ml=900,
        urgencia='CRITICA',
        status='ACTIVE',
        descricao='Estoque de DEA 1.1 negativo em nível crítico de segurança. Dois pacientes em UTI cirúrgica necessitando de transfusão imediata.',
    )
    need2 = BloodNeed(
        institution_id=inst1.id,
        especie='FELINA',
        tipo_sanguineo='Tipo A',
        volume_solicitado_ml=200,
        urgencia='ALTA',
        status='ACTIVE',
        descricao='Reposição preventiva para procedimento de colectomia felina agendado.',
    )
    db.session.add_all([need1, need2])
    db.session.flush()

    db.session.add_all([
        NeedNotification(need_id=need1.id, tutor_id=tutor1.id, pet_id=pet1.id, canal='PUSH', status='SENT', mensagem='Hemovet Central 24h precisa de sangue canino DEA 1.1 Negativo!'),
        NeedNotification(need_id=need1.id, tutor_id=tutor1.id, pet_id=pet2.id, canal='PUSH', status='SENT', mensagem='Hemovet Central 24h precisa de sangue canino DEA 1.1 Negativo!'),
        NeedNotification(need_id=need1.id, tutor_id=tutor2.id, pet_id=pet4.id, canal='PUSH', status='SENT', mensagem='Hemovet Central 24h precisa de sangue canino DEA 1.1 Negativo!'),
        NeedNotification(need_id=need2.id, tutor_id=tutor1.id, pet_id=pet3.id, canal='PUSH', status='SENT', mensagem='Hemovet Central 24h precisa de sangue felino Tipo A!'),
    ])

    # 10. Interesses
    int1 = DonorInterest(need_id=need1.id, tutor_id=tutor1.id, pet_id=pet1.id, status='MANIFESTADO', observacao_tutor='Disponível hoje no período da manhã.')
    int2 = DonorInterest(need_id=need1.id, tutor_id=tutor2.id, pet_id=pet4.id, status='SELECIONADO_AGENDAMENTO', observacao_tutor='Thor está em jejum hídrico ok.')
    db.session.add_all([int1, int2])

    # 11. Agendamentos
    app1 = Appointment(
        institution_id=inst1.id,
        tutor_id=tutor1.id,
        pet_id=pet1.id,
        need_id=need1.id,
        data_hora=datetime(2026, 10, 10, 10, 30, tzinfo=timezone.utc),
        data_hora_label='2026-10-10 10:30',
        slot_codigo='SLOT-HEMOVET-MANHA-01',
        status='SCHEDULED',
    )
    app2 = Appointment(
        institution_id=inst1.id,
        tutor_id=tutor2.id,
        pet_id=pet4.id,
        need_id=need1.id,
        data_hora=datetime(2026, 10, 10, 14, 0, tzinfo=timezone.utc),
        data_hora_label='2026-10-10 14:00',
        slot_codigo='SLOT-HEMOVET-TARDE-01',
        status='CONFIRMED',
    )
    db.session.add_all([app1, app2])
    db.session.flush()

    # 12. Voucher inicial do Zeus
    v1 = Voucher(
        donation_id=None,
        tutor_id=tutor1.id,
        institution_id=inst1.id,
        codigo='DOEPET-CAN-9812-ZEUS',
        beneficio_descricao='Check-up Clínico Preventivo Completo + Hemograma Gratuito + Isenção em Vacina Antirrábica',
        data_validade=datetime(2026, 12, 31, 23, 59, tzinfo=timezone.utc),
        status='ATIVO',
    )
    db.session.add(v1)

    # 13. Logs iniciais de auditoria
    db.session.add_all([
        AuditLog(
            actor_id=u_clinic1.id,
            actor_type='INSTITUTION_ADMIN',
            action='CREATE_BLOOD_NEED',
            resource_type='BloodNeed',
            resource_id=str(need1.id),
            correlation_id='req-c7a829f0-2026-0322-001',
            after_data={'especie': 'CANINA', 'tipo': 'DEA 1.1 Negativo', 'volumeMl': 900, 'urgencia': 'CRITICA'},
        ),
        AuditLog(
            actor_id=u_clinic1.id,
            actor_type='SYSTEM_NOTIFICATION',
            action='DISPATCH_PUSH_ALERTS',
            resource_type='NeedNotification',
            resource_id='3_DESTINATARIOS',
            correlation_id='req-c7a829f0-2026-0322-002',
            after_data={'totalEnviados': 3, 'canal': 'PUSH'},
        ),
        AuditLog(
            actor_id=u_tutor1.id,
            actor_type='TUTOR',
            action='EXPRESS_DONOR_INTEREST',
            resource_type='DonorInterest',
            resource_id='1',
            correlation_id='req-e54911d3-2026-0322-003',
            after_data={'needId': need1.id, 'tutor': 'Ricardo Santos', 'pet': 'Zeus (Golden Retriever)'},
        ),
    ])

    db.session.commit()
    return True


if __name__ == '__main__':
    from doepet_flask_mysql.app import create_app

    flask_app = create_app(seed_on_startup=False)
    with flask_app.app_context():
        seeded = seed_database()
        print('[DoePet Seed]', 'Dados iniciais inseridos.' if seeded else 'Banco já populado (noop).')

