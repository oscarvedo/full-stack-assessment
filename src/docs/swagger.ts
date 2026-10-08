export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Plataforma de Activos Digitales — API Core',
    version: '1.0.0',
    description: 'Prueba Técnica: Líder Técnico Full-Stack — Plataforma de Activos Digitales (BPM Consulting). Custodia de wallets internas cerradas, control transaccional ACID, ledger inmutable, cotización garantizada y monitoreo de cumplimiento simulado.',
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Servidor local de desarrollo',
    },
  ],
  components: {
    securitySchemes: {
      UserIdHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'X-User-Id',
        description: 'Identificador simplificado de autenticación de usuario (ejemplo: user-001 o compliance-001)',
      },
    },
  },
  security: [
    {
      UserIdHeader: [],
    },
  ],
  paths: {
    '/health': {
      get: {
        summary: 'Verificación del Estado del Servicio (Health Check)',
        description: 'Retorna el estado de disponibilidad y salud de la API.',
        responses: {
          '200': { description: 'El servicio se encuentra operativo' },
        },
      },
    },
    '/wallets': {
      get: {
        summary: 'Consultar Wallets del Usuario',
        description: 'Retorna todas las billeteras del usuario autenticado con sus saldos disponibles, retenidos y totales.',
        responses: {
          '200': { description: 'Lista de billeteras del usuario con sus respectivos saldos' },
          '401': { description: 'No autenticado (Encabezado X-User-Id ausente o usuario no registrado)' },
          '403': { description: 'Acceso denegado (Requiere rol de Usuario)' },
        },
      },
    },
    '/wallets/{id}/movements': {
      get: {
        summary: 'Consultar Historial del Ledger de una Wallet',
        description: 'Retorna los movimientos inmutables de auditoría contable (débitos, créditos, retenciones) de la billetera especificada.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Identificador único (UUID) de la wallet',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Historial cronológico de movimientos del ledger' },
          '401': { description: 'No autenticado' },
          '404': { description: 'Billetera no encontrada o no pertenece al usuario' },
        },
      },
    },
    '/quotes': {
      post: {
        summary: 'Solicitar Cotización Comercial',
        description: 'Genera una cotización garantizada con vigencia de 30 segundos a tasa fija 1 XAUT = 2500 USDT con comisión del 1%.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['fromAmount'],
                properties: {
                  fromAmount: {
                    type: 'string',
                    description: 'Monto en USDT-SBX a cotizar',
                    example: '2500',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Cotización creada exitosamente' },
          '400': { description: 'Monto inválido o no numérico' },
          '401': { description: 'No autenticado' },
          '403': { description: 'Acceso denegado (Requiere rol de Usuario)' },
        },
      },
    },
    '/exchanges': {
      post: {
        summary: 'Ejecutar Intercambio de Activos',
        description: 'Ejecuta el intercambio de forma atómica con bloqueo pesimista a nivel de fila y control de idempotencia.',
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: true,
            description: 'Clave única para garantizar idempotencia en la operación',
            schema: { type: 'string' },
            example: 'transaccion-001',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['quoteId'],
                properties: {
                  quoteId: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Identificador único de la cotización activa',
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Intercambio procesado (COMPLETED) o retenido para revisión (PENDING_REVIEW)' },
          '400': { description: 'Saldo insuficiente o cotización expirada' },
          '401': { description: 'No autenticado' },
          '409': { description: 'Conflicto (Clave de idempotencia reutilizada con contenido o usuario diferente)' },
        },
      },
    },
    '/exchanges/{id}': {
      get: {
        summary: 'Consultar Detalle y Trazabilidad del Intercambio',
        description: 'Obtiene el detalle completo de la operación, estado actual, snapshot de la cotización y trazabilidad de cumplimiento.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Identificador único (UUID) del intercambio',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Detalle completo del intercambio' },
          '401': { description: 'No autenticado' },
          '404': { description: 'Intercambio no encontrado' },
        },
      },
    },
    '/compliance/exchanges/pending': {
      get: {
        summary: 'Listar Operaciones Retenidas (Solo Oficial de Cumplimiento)',
        description: 'Retorna todas las transacciones retenidas en estado PENDING_REVIEW (> 5000 USDT) para revisión manual.',
        responses: {
          '200': { description: 'Lista de operaciones retenidas pendientes de decisión' },
          '401': { description: 'No autenticado' },
          '403': { description: 'Acceso denegado (Requiere rol de Cumplimiento)' },
        },
      },
    },
    '/compliance/exchanges/{id}/approve': {
      patch: {
        summary: 'Aprobar Operación Retenida (Solo Oficial de Cumplimiento)',
        description: 'Debita el saldo retenido en USDT, acredita XAUT, actualiza el estado a COMPLETED y registra la decisión de auditoría.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Identificador único (UUID) de la operación retenida',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  notes: {
                    type: 'string',
                    description: 'Notas u observaciones del oficial de cumplimiento',
                    example: 'Documentación verificada y origen de fondos sustentado.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Operación aprobada y activos liquidados exitosamente' },
          '400': { description: 'La operación no se encuentra pendiente de revisión' },
          '401': { description: 'No autenticado' },
          '403': { description: 'Acceso denegado (Requiere rol de Cumplimiento)' },
          '404': { description: 'Operación no encontrada' },
        },
      },
    },
    '/compliance/exchanges/{id}/reject': {
      patch: {
        summary: 'Rechazar Operación Retenida (Solo Oficial de Cumplimiento)',
        description: 'Libera los fondos retenidos en USDT de vuelta al saldo disponible, marca el estado como REJECTED y estampa las notas de auditoría.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Identificador único (UUID) de la operación retenida',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  notes: {
                    type: 'string',
                    description: 'Motivo del rechazo de la operación',
                    example: 'Operación rechazada por exceder políticas internas de riesgo.',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Operación rechazada y fondos liberados al disponible' },
          '400': { description: 'La operación no se encuentra pendiente de revisión' },
          '401': { description: 'No autenticado' },
          '403': { description: 'Acceso denegado (Requiere rol de Cumplimiento)' },
          '404': { description: 'Operación no encontrada' },
        },
      },
    },
  },
};
