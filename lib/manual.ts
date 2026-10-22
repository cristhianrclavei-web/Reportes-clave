// Contenido del manual de uso (/ayuda). Texto plano por tema, separado por
// rol: se edita aquí sin tocar la pantalla. Cada tema es una lista de pasos
// cortos; `nota` es una aclaración que va al final.

export type TemaManual = { titulo: string; resumen: string; pasos: string[]; nota?: string };
export type SeccionManual = { titulo: string; temas: TemaManual[] };

export const MANUAL_TECNICO: SeccionManual[] = [
  {
    titulo: 'Tu día',
    temas: [
      {
        titulo: 'Ver tus servicios',
        resumen: 'Lo que tienes asignado hoy y los próximos días.',
        pasos: [
          'Entra a «Servicios». Arriba salen los pendientes y abajo los concluidos.',
          'Cuando te asignan uno nuevo, toca «Enterado» para que tu supervisor sepa que ya lo viste.',
          'Toca un servicio para ver la dirección, la descripción, el material y la lista de tareas.',
        ],
      },
      {
        titulo: 'Llegar, iniciar y concluir',
        resumen: 'Así queda registrado a qué hora llegaste y cuánto duró el trabajo.',
        pasos: [
          'En Servicios, la pestaña «Calendario» muestra tu mes: toca un día para ver lo que hiciste y lo que tienes programado.',
          'Al llegar al sitio toca «Marcar llegada». Si el servicio tiene ubicación y tienes esta pantalla abierta, la llegada se marca sola al entrar al sitio.',
          'Cuando empieces a trabajar toca «Iniciar servicio»: el inicio siempre es manual, para que la espera en el ingreso no cuente como trabajo. Mientras no inicies te llega un recordatorio cada 10 minutos.',
          'Si algo te detiene (el ingreso no está listo, falta el permiso de trabajo, no está el contacto…) toca «Algo me impide iniciar» y elige el motivo: se avisa a supervisión y queda registrado.',
          'Para salir a comer o por material usa «Pausar» y elige el motivo. Cada pausa tiene su tiempo (la comida, el que fije supervisión): la pantalla te muestra cuánto te queda y te llega un recordatorio 10 minutos antes y otro al terminar. Si te pasas, se avisa a supervisión.',
          'Si sales por material, escribe a dónde vas y cuánto calculas tardar: supervisión recibe el aviso de tu salida.',
          'Toca «Reanudar servicio» cuando ya estés de vuelta en el sitio. La app registra dónde estás al pausar y al reanudar; si reanudas lejos del sitio, queda marcado.',
          'Con el servicio en curso y esta pantalla abierta, si la app te detecta lejos del sitio sin pausa te lo avisa y lo registra. Pon la pausa antes de salir.',
          'Si supervisión pide verificar tu presencia, te llega un aviso: abre el servicio y toca «Estoy aquí» dentro del tiempo indicado. Ten activados los avisos y el permiso de ubicación.',
          'Toca una tarea para registrar su avance (25, 50, 75 o 100 %) con foto, video o nota. Puedes volver a tocarla las veces que haga falta: cada vez se suma otra evidencia y, si sigue a medias, cambias el porcentaje. Una tarea completada también acepta más fotos. Las fotos de cada tarea se ven en miniatura dentro de ella; mientras no termines el servicio, la ✕ roja de cada miniatura la elimina (también en la lista de evidencias).',
          'Una «Foto rápida» o un video sueltos se pueden ligar a una tarea después: en la lista de evidencias, elige la tarea en «Ligar a una tarea…».',
          'Al hacer el reporte de ese servicio, las fotos y videos del día ya vienen cargados y las tareas trabajadas pasan solas a «Actividades» (las que siguen a medias, con su porcentaje). Puedes editarlas.',
          'Al terminar un día intermedio de un proyecto, si ya se acabó todo el trabajo elige «Ya se terminó todo el servicio»: los días que faltan se cancelan. Solo se puede con todas las tareas al 100 %.',
          'Para evidencias usa «Foto rápida» (abajo): abre la cámara y la foto se guarda sola. El comentario lo puedes agregar después en la lista, mientras no termines el servicio. Si no hay señal, la foto se queda guardada en el teléfono y se sube sola al volver la conexión: no cierres sesión hasta que suba.',
          'Para un video de evidencia toca el botón de la cámara de video, junto a «Foto rápida»: se abre la grabadora, grabas hasta 30 segundos, lo revisas y tocas «Usar video». Sale ya comprimido para que no pese. Hay el mismo botón en la bitácora y en el paso «Evidencia» del reporte; máximo 3 videos por servicio, actividad o reporte.',
          'Si llegaste más de 15 minutos después de la hora acordada, la app te pregunta qué pasó (tráfico, el cliente no estaba, permisos…). Elige el motivo para continuar.',
          'Al terminar toca «Concluir» y responde cómo quedó el trabajo: terminado, pendiente o no se pudo realizar. Si no se terminó o cierras más de 15 minutos tarde, elige el motivo.',
          'Si llegaste y no hay forma de trabajar (el cliente no tiene el equipo, no hay acceso), toca «No se pudo trabajar»: elige el motivo, explica qué pasó y, si puedes, toma una foto y pide la firma de quien te atendió. El día se cierra y tu supervisor decide si queda sin reporte; mientras lo revisa no se te pide.',
          'Después haz tu reporte.',
        ],
        nota: 'Un servicio solo se puede iniciar el día que está programado. Si la fecha está mal, avísale a tu supervisor para que la cambie.',
      },
    ],
  },
  {
    titulo: 'Reportes',
    temas: [
      {
        titulo: 'Hacer un reporte',
        resumen: 'Son cuatro pasos: Datos, Trabajo, Evidencia y Firmas.',
        pasos: [
          'Toca «Nuevo reporte». Si el reporte es de un servicio asignado, elígelo arriba y se llenan solos el cliente, el personal y las horas de llegada y salida que registraste en el servicio (las puedes corregir). Con un servicio elegido tampoco se pregunta si ya se concluyó: se toma del servicio (concluido en su último día con el trabajo terminado; en curso en los días intermedios o si quedó trabajo pendiente). Esa pregunta solo sale en reportes sin servicio.',
          'Datos: cliente, contacto, horas de llegada y salida, vehículo y quién fue. La fecha del reporte debe ser la del servicio elegido: un reporte del 15 no se puede ligar al servicio del 14 (la app te avisa y te ofrece usar la fecha del servicio).',
          'Trabajo: tipo de servicio (marca todos los que hiciste, por ejemplo instalación y mantenimiento correctivo), sistema, materiales usados y la descripción de lo que hiciste.',
          'Evidencia: toma o elige las fotos y marca si el servicio ya quedó concluido.',
          'En cada foto: el ojo decide si sale en el PDF del cliente o se queda solo en la app (no se borra); el botón de ajustes le pone etapa (Antes, Durante, Después) y área. Con etapa y área, el PDF las agrupa y pone el antes y el después lado a lado.',
          'Después de guardado, en la pestaña «Fotos» de tu reporte puedes seguir usando el ojo y el botón de ajustes (etapa y área): sirve para dejar fuera las fotos que no hacen falta y acomodar las demás antes de mandarle una copia del PDF al cliente.',
          'Firmas: firma tú y pide la firma del cliente. Revisa la vista previa y toca «Guardar reporte».',
        ],
        nota: 'Lo que vas llenando se guarda solo en el teléfono: si se cierra la app o se recarga la página, al volver lo recuperas.',
      },
      {
        titulo: 'Levantamiento técnico',
        resumen: 'Para revisar un sitio antes de cotizar.',
        pasos: [
          'En Reportes → Levantamientos toca «Nuevo levantamiento» y llena los datos del sitio.',
          'Agrega un bloque por cada sistema que revises (CCTV, alarma, etc.) con su estado actual.',
          'En «Equipos existentes» toca «Agregar equipo» por cada tipo de equipo instalado: cantidad, descripción, modelo y estado (funciona, con fallas, no funciona, obsoleto o sin probar).',
          'En «Recomendaciones» escribe un punto por renglón; salen numerados (1, 2, 3…). Con Enter pasas al siguiente punto.',
          'Toma fotos de cada sistema y, al final, notas y fotos generales del sitio. El PDF incluye la tabla de equipos y la lista de recomendaciones.',
        ],
      },
      {
        titulo: 'Si no hay señal',
        resumen: 'Puedes hacer el reporte sin internet.',
        pasos: [
          'Llena y guarda el reporte como siempre.',
          'Queda guardado en el teléfono y se sube solo cuando regresa la señal.',
          'Mientras tanto verás un aviso de «pendiente por sincronizar». No borres los datos del navegador hasta que desaparezca.',
        ],
      },
      {
        titulo: 'Si el cliente no está para firmar',
        resumen: 'El reporte se puede guardar y la firma se pide después.',
        pasos: [
          'En Firmas elige «El cliente no está» y anota el motivo.',
          'Guarda el reporte. Queda como pendiente de firma.',
          'Desde el reporte puedes mandar por WhatsApp un enlace para que el cliente firme desde su teléfono.',
        ],
      },
      {
        titulo: 'Reportes de compañeros',
        resumen: 'Consulta lo que se hizo en un sitio aunque el reporte lo haya capturado un compañero.',
        pasos: [
          'En Reportes abre la pestaña «Reportes de compañeros». Salen los reportes que hizo otro técnico y en los que tú también trabajaste (porque estabas asignado al servicio o tu nombre está en el personal del reporte).',
          'De cada uno ves el cliente, la fecha, las horas, el folio, quién lo hizo y las actividades. Usa el buscador para encontrar el sitio.',
        ],
        nota: 'Es solo consulta: no se ven fotos, firmas ni materiales. Si necesitas el reporte completo, pídeselo a quien lo hizo o a tu supervisor.',
      },
      {
        titulo: 'Corregir un reporte',
        resumen: 'Si te equivocaste en un dato o te faltó algo.',
        pasos: [
          'Durante la primera hora después de guardarlo, y mientras nadie lo haya firmado (ni el cliente ni quien recibió en su lugar), abre el reporte en «Reportes» y toca «Editar reporte». Cambia lo que haga falta y toca «Guardar cambios»: se actualiza el mismo reporte, con el mismo folio.',
          'Pasada la hora, o si ya tiene firma, pide una corrección al supervisor desde la pestaña «Revisión» del reporte.',
          'Cuando el supervisor la autoriza, el reporte aparece marcado para corrección. Ábrelo, corrige y guarda. Conserva el mismo folio y vuelve a revisión.',
        ],
      },
      {
        titulo: 'Días sin reporte',
        resumen: 'Cada día hábil debe tener un reporte o una justificación.',
        pasos: [
          'Si te falta el de algún día, verás un aviso arriba en «Reportes».',
          'Toca «Hacer reporte» o «Justificar» y elige el motivo (no saliste a servicio, vacaciones, etc.).',
          'Tu justificación le llega a supervisión para que la autorice. Si la rechaza, el día vuelve a pedirte reporte y puedes justificarlo otra vez.',
          'Si un servicio de un día anterior quedó abierto, cada mañana te llega un aviso para cerrarlo y hacer su reporte.',
        ],
      },
    ],
  },
  {
    titulo: 'Material, bitácora y solicitudes',
    temas: [
      {
        titulo: 'Pedir material al almacén',
        resumen: 'En «Insumos» pides lo que necesitas para un servicio.',
        pasos: [
          'Toca «Pedir al almacén», elige los artículos y la cantidad.',
          'Si se te vence el plazo para devolver, abre el vale y toca «Renovar plazo: pedir más días»: eliges cuántos y para qué. Mientras el almacén no responde, el vale dice «Ya pediste N día(s) más» y puedes tocar «Recordar al almacén».',
          'Cuando el almacén lo surte, firmas de recibido: desde tu celular, o ahí mismo en el dispositivo del almacén si recibes en persona.',
          'La herramienta prestada se devuelve desde ahí mismo al terminar.',
        ],
      },
      {
        titulo: 'Bitácora',
        resumen: 'Para registrar lo que haces fuera de un servicio (oficina, taller, traslados).',
        pasos: [
          'Toca el tipo de actividad (traslado, compra, oficina o taller, capacitación, apoyo a cliente u otro), ponle nombre y, si aplica, el cliente. Se registran la hora y tu ubicación.',
          'Dentro de la actividad usa «Foto rápida»: abre la cámara y la foto se guarda sola; el comentario lo agregas después. Con «Pausar» detienes el tiempo y con «Concluir» la cierras.',
          '«Mi día» muestra tu jornada como una línea de tiempo con todas las horas, de la entrada a la salida: servicios, comida, pausas y actividades, cada uno a su altura, y con rayas ámbar lo que quedó sin registrar. Cada minuto cuenta una sola vez. Toca un tramo con rayas para llenarlo; toca algo que registraste a mano para editar su horario o tipo, o borrarlo.',
          'Si se te pasó iniciar algo (subir material en la oficina, el traslado, la compra), toca «¿Se te pasó iniciar algo? Regístralo a mano», o «Llenar» en un tramo sin registrar. Eliges qué fue, de qué hora a qué hora y quién iba contigo: a ellos se les registra lo mismo.',
          'Si lo que registras choca con otra actividad de tu bitácora, la app te avisa y no deja guardar; te ofrece los tramos libres para ajustar con un toque. Si cae dentro de un servicio (por ejemplo, saliste por material) sí se guarda, y ese rato se descuenta del servicio.',
          'Si te equivocaste de día u hora, puedes borrar tus actividades de los últimos 7 días (iniciadas en vivo o a mano) desde su detalle o tocándolas en «Mi día», y registrarlas de nuevo a mano. Lo registrado a mano también se puede editar. Solo cambia tu registro, no el de tus acompañantes. Si la actividad ya tiene un reporte ligado, pide a supervisión que la borre.',
          'Un día sin servicio programado y con actividad en la bitácora no te pide justificación; supervisión lo autoriza. Si ese día tuviste servicio, la bitácora no lo cubre: hace falta el reporte.',
          'Si una actividad se queda abierta, se cierra sola al terminar el día con la hora de tu último movimiento y te pide confirmar a qué hora terminaste.',
          'Si un apoyo terminó siendo un trabajo, en la actividad ya concluida usa «Hacer un reporte con esta actividad»: el reporte abre con el cliente, las notas y las fotos ya puestas.',
        ],
      },
      {
        titulo: 'Horas extra, vacaciones y permisos',
        resumen: 'Se piden y se autorizan desde «Solicitudes».',
        pasos: [
          'Elige el tipo de solicitud, llena las fechas u horas y firma.',
          'Le llega a quien autoriza. Te avisamos cuando la aprueben, la rechacen o pidan una corrección.',
        ],
      },
    ],
  },
  {
    titulo: 'Tu cuenta',
    temas: [
      {
        titulo: 'Asistente',
        resumen: 'Pregunta por tus servicios, reportes y material, escribiendo o hablando.',
        pasos: [
          'Toca el botón redondo de la esquina inferior derecha y escribe tu pregunta, por ejemplo «¿qué servicios tengo mañana?».',
          'También te ayuda a preparar un servicio: pregunta «¿qué herramienta y equipo llevo mañana?» y revisa la lista de carga del servicio y las plantillas de la empresa; si no hay, te da una recomendación general.',
          'Los nombres en color dentro de la respuesta son enlaces: tócalos para abrir ese reporte o servicio.',
          'Con el micrófono puedes preguntar hablando; al terminar de hablar la pregunta se envía sola.',
          'El botón de la bocina activa que las respuestas se lean en voz alta.',
          'Con el botón de la imagen adjuntas fotos (la placa de un equipo, una falla) para que lea marca, modelo o número de serie.',
          'Con el cuadro de texto vacío, el botón principal abre la conversación por voz: hablas, te contesta y vuelve a escuchar.',
          'El reloj del encabezado abre tu historial por día.',
          'Para pedir material dile, por ejemplo, «necesito 100 metros de UTP y una escalera para el servicio de mañana»: arma el vale, te lo lee y al confirmar avisa al almacén.',
          'Cuando te pregunta algo con pocas respuestas, aparecen botones para contestar de un toque.',
          'Los pulgares debajo de cada respuesta sirven para decir si te ayudó.',
        ],
        nota: 'Lo único que hace además de consultar es crear el vale de material que le pidas, y siempre te pide confirmar. Ve lo mismo que tú ves en la app y, además, la dirección y los contactos de los clientes. Disponible si el paquete de tu empresa lo incluye.',
      },
      {
        titulo: 'Tu perfil',
        resumen: 'Foto o avatar, puesto, especialidades y datos de emergencia.',
        pasos: ['Toca tu nombre o tus iniciales arriba para abrir «Mi perfil».', 'Cambia lo que necesites y toca «Guardar perfil».'],
      },
      {
        titulo: 'Notificaciones',
        resumen: 'Avisos en el teléfono aunque la app esté cerrada.',
        pasos: ['Toca «Activar» en el aviso de notificaciones y acepta el permiso del navegador.', 'En iPhone primero hay que agregar la app a la pantalla de inicio.'],
      },
      {
        titulo: 'Instalar la app en el teléfono',
        resumen: 'Para abrirla como cualquier otra app.',
        pasos: ['Android (Chrome): menú ⋮ → «Agregar a pantalla principal».', 'iPhone (Safari): botón Compartir → «Agregar a inicio».'],
      },
    ],
  },
];

export const MANUAL_SUPERVISOR: SeccionManual[] = [
  {
    titulo: 'El día a día',
    temas: [
      {
        titulo: 'Resumen',
        resumen: 'Lo primero que conviene ver al entrar.',
        pasos: [
          'Arriba: reportes de hoy y de la semana, lo que falta por facturar y los avisos que piden una decisión.',
          '«Productividad del equipo» muestra servicios concluidos, horas en sitio y reportes entregados de los últimos 7, 14 o 30 días, cada uno comparado con el periodo anterior. Toca una de las tres cifras para verla día por día en la gráfica; la línea punteada es el periodo anterior.',
          '«Reportes por técnico» cuenta cuántos reportes hizo cada persona desde su propia cuenta; no importa quién lo firma.',
          'En «KPIs operativos» puedes ver hoy, esta semana o un mes completo: toca «Mes» y usa las flechas para elegir cuál.',
          'Abajo: las gráficas de la semana y el desempeño operativo. Pasa el cursor (o toca) sobre una columna, barra o punto para ver qué se midió ahí. El botón ⓘ de cada tarjeta explica cómo se calcula.',
          '«Eficiencia de servicios» lee cada día concluido de las últimas 8 semanas como a favor, en contra o desviado por causa externa, según lo que el técnico respondió al cerrar. Muestra los motivos más frecuentes y el detalle por técnico o por cliente.',
          '«Visitas en falso» cuenta los días en que el personal llegó y no se pudo trabajar, por cliente.',
          '«En qué se va el tiempo» reparte las horas del equipo de los últimos 7 días entre servicios y lo registrado en bitácora (traslados, compras, oficina, capacitación, apoyos). Abre una actividad de «Bitácora del personal» para programar un servicio a partir de ella.',
          'Para borrar una actividad de la bitácora (por ejemplo, una de prueba) ábrela desde «Bitácora del personal en campo» → «Ver todas» y toca «Eliminar actividad», al final. Se borran sus notas y fotos; si ya tiene reporte, las fotos se conservan en el reporte.',
          'Los videos de evidencia se ven en la app, en el servicio, la actividad o la pestaña «Fotos» del reporte; en el PDF sale su portada con un código QR (y enlace tocable) para que el cliente lo vea sin cuenta. Si el almacenamiento pasa del 80 %, aparece un aviso aquí en el Resumen.',
          'La pantalla se actualiza sola cuando llega un reporte.',
        ],
      },
      {
        titulo: 'Visita sin trabajo',
        resumen: 'Cuando el técnico llegó y no se pudo trabajar, tú decides si ese día queda sin reporte.',
        pasos: [
          'Te llega el aviso «Visita sin trabajo: revisar». Abre el servicio: verás el motivo, lo que explicó el técnico, la foto y quién lo atendió.',
          '«Liberar del reporte»: ese día deja de exigir reporte y se cortan los recordatorios. «Sí requiere reporte»: vuelve a exigirse y el técnico recibe tu explicación.',
          '«Reprogramar» crea un servicio nuevo con el mismo cliente, técnicos, horario y las tareas que quedaron sin hacer.',
          '«Hoja de visita» genera la constancia en PDF (llegada, motivo, foto y firma) para el cliente o para cobrar la visita.',
          'Si el técnico cerró el día de otra forma pero no se trabajó, en el servicio concluido aparece «No se trabajó: liberar este día del reporte».',
        ],
        nota: 'Solo los supervisores pueden liberar un día del reporte. Queda registrado en Eventos quién lo hizo.',
      },
      {
        titulo: 'Tablero del día',
        resumen: 'Servicios → Hoy: quién está en dónde, en vivo.',
        pasos: [
          'En computadora puedes verlo por servicio o por persona. En celular la gente va agrupada: requieren atención, en campo, por iniciar, concluyeron y disponibles.',
          'Toca a una persona o un servicio para ver el detalle y hacer un cambio en el día.',
          'Usa los botones de cuadrilla para ver solo a un grupo, o «Mis cuadrillas» si tienes alguna a tu cargo.',
          '«Asignar servicio» agenda uno rápido para hoy.',
          'Un servicio en pausa muestra el motivo (comida, material…). Si la pausa pasa de su tiempo aparece «Pausa excedida» y el servicio se marca para atención.',
        ],
      },
      {
        titulo: 'Pausas, comida y presencia en sitio',
        resumen: 'Cuánto dura una pausa, qué pasa si se excede y cómo comprobar que alguien está en el sitio.',
        pasos: [
          'En Servicios → Hoy, abre «Pausas y comida» para fijar los minutos de comida, de las demás pausas, la tolerancia y el tiempo para responder una verificación. Aplican desde la siguiente pausa.',
          'El personal recibe un recordatorio 10 minutos antes de que termine su pausa y otro al terminar. Pasada la tolerancia recibe un tercero y a ti te llega «Pausa excedida».',
          'Una salida por material siempre te avisa: quién salió, a dónde y cuánto calcula tardar.',
          'En el detalle del servicio, cada registro de la línea de tiempo dice quién lo hizo y si se hizo «En sitio» o a qué distancia. «Reanudó fuera del sitio» y «Fuera del sitio» (detectado con el servicio en curso) también te llegan como aviso.',
          'Si alguien olvidó cerrar un servicio, en su detalle toca «Cerrar por el técnico», pon la hora en que de verdad terminaron (ya viene la de su último registro) y cómo lo supiste. Así la duración no cuenta horas que no se trabajaron.',
          'Si al cerrarlo pusiste una hora equivocada (por ejemplo, la de llegada a la oficina en vez de la de salida del sitio), toca «Corregir la hora de término» en el mismo servicio. El cierre que hizo el técnico no se cambia ahí.',
          'Si nadie lo cierra, a las 12:10 de la noche se cierra solo con la hora del último registro y queda «Cierre por confirmar». En la mañana te llega un aviso: entra al servicio y confirma o corrige la hora.',
          'La app no puede seguir a nadie con el teléfono guardado: la ubicación solo se toma cuando la persona registra algo o tiene abierta la pantalla del servicio.',
          'Para comprobar que alguien está en el sitio, en el detalle del servicio toca «Pedir verificación». Le llega un aviso y tiene unos minutos para tocar «Estoy aquí»; verás «En sitio», «Fuera del sitio» con la distancia, o «Sin respuesta».',
          '«Sin respuesta» no prueba una ausencia: sin señal o con el teléfono en silencio pasa lo mismo. Tómalo como señal para llamarle.',
          'En el Resumen, «Pausas del personal» muestra por persona las comidas del mes, su promedio, las excedidas y las veces fuera del sitio. Es informativo y no cambia la eficiencia.',
        ],
      },
      {
        titulo: 'Agendar servicios',
        resumen: 'Desde Servicios → Agendados o desde la Agenda.',
        pasos: [
          'Toca «Agendar», elige el cliente, la fecha, la hora y a quién va (personas o una cuadrilla completa). La ubicación del sitio la buscas escribiendo el nombre o la dirección (salen las mismas sugerencias que en Google Maps), la pegas de un enlace de Google Maps o la marcas en el mapa.',
          'Puedes cargar una rutina de tareas y una lista de herramienta y material.',
          'Los servicios de varios días se agendan como un solo proyecto.',
          'Para eliminar: en Servicios despliega el proyecto. El bote de basura junto a un día quita solo ese día (pide el motivo; no aparece en días ya trabajados o con reporte), y «Eliminar el proyecto completo» borra todo. Las dos piden confirmación.',
          'Al indicar más de un día aparece «Día por día»: todos siguen la fecha y el horario generales, y con el lápiz le cambias a un día suelto su fecha, su llegada o su salida (por ejemplo, el día 1 de 11:00 a 15:00 y el día 2 de 9:00 a 17:00). «Volver al horario general» deshace el cambio de ese día.',
          'La Agenda abre en «Mes»: cada día muestra puntos de lo hecho, lo que viene y lo que quedó sin concluir. Toca un día para ver su detalle al lado y usa «Programar servicio este día» para agendar ahí.',
          'En «Semana» ves la semana de todo el equipo; con «+» asignas a una persona en un día.',
        ],
        nota: 'En Agenda → Recurrentes dejas programados los mantenimientos periódicos: la app te avisa 14 días antes para agendarlos.',
      },
      {
        titulo: 'Cambiar, cancelar o ampliar un servicio',
        resumen: 'Todo desde el detalle del servicio.',
        pasos: [
          '«Cambiar fecha» lo mueve de día; «Cancelar servicio» lo deja en el historial con el motivo.',
          '«Reasignar» cambia al personal y «Ampliar a más días» lo convierte en proyecto.',
          'Arriba ves el horario (llegada y salida) y quién lo agendó y cuándo. Con «Editar» cambias el proyecto, la fecha, la duración, el horario y la ubicación, mientras el servicio no empiece.',
          'En la ubicación, «Marcar el punto en el mapa» abre un mapa (o vista de satélite): toca donde está el sitio o arrastra el pin para afinarlo. La dirección se llena sola.',
          'En «Lista de tareas» toca «Editar lista» (o «Agregar tareas» si no tiene) para agregar, renombrar o quitar tareas. Las que ya tienen avance llevan candado: no se quitan y su nombre se cambia con «Corregir». A los técnicos les llega un aviso del cambio.',
          'Cada cambio queda registrado en Actividad.',
        ],
      },
      {
        titulo: 'Corregir tareas de un día',
        resumen: 'Cuando terminaron una tarea y se les pasó marcarla, o el avance quedó mal.',
        pasos: [
          'Abre el día del servicio. En «Lista de tareas» toca «Corregir» junto a la tarea.',
          'Puedes cambiarle el nombre y poner el avance con que quedó al cierre de ESE día (0%, 25%, 50%, 75%, «Terminada» o el número que quieras).',
          'Lo que registró el técnico no se borra: tu corrección queda como el último registro del día y es la que cuenta para el avance del proyecto.',
          'Las actividades de los reportes del proyecto que nadie ha firmado (ni el cliente ni quien recibió) se actualizan solas. Lo que el técnico escribió a mano se respeta. Los reportes ya firmados no cambian.',
        ],
        nota: 'Cada reporte usa el avance que había al cierre de su día, aunque se haga después: si el día 1 una tarea quedó al 50% y el día 2 se terminó, el reporte del día 1 dice 50%.',
      },
    ],
  },
  {
    titulo: 'Reportes',
    temas: [
      {
        titulo: 'Revisar y aprobar',
        resumen: 'Un reporte está completo cuando lleva la firma de revisión.',
        pasos: [
          'En Reportes abre uno para ver datos, fotos y firmas, y descargar su PDF.',
          'En la pestaña «Fotos» del reporte, el ojo de cada foto la incluye o la deja fuera del PDF del cliente (sigue viéndose en la app) y el botón de ajustes cambia su comentario, etapa y área. El PDF lleva las fotos en un anexo «Evidencia fotográfica», agrupadas por área y con el antes y después lado a lado.',
          'En la pestaña «Revisión» lo apruebas con tu firma o pides una corrección con una nota para el técnico.',
          'Al concluir el servicio el reporte queda «pendiente de facturar». Se quita solo cuando el reporte entra en una factura; si no se va a cobrar, quien factura registra el motivo en «No se va a facturar».',
        ],
      },
      {
        titulo: 'Control y cobertura',
        resumen: 'Quién entregó su reporte y quién no.',
        pasos: [
          '«Control» muestra por persona los días pendientes y qué tan puntual entrega.',
          '«Cobertura» es el calendario: cada día hábil debe tener reporte o justificación.',
          'Puedes justificar un día por alguien y marcar días festivos.',
          'Lo que justifica el técnico, o un día que solo tiene bitácora, sale «Por autorizar» (cuadro punteado con «?»). Tócalo para ver el motivo y quién lo registró, y usa «Autorizar» o «Rechazar». Si lo rechazas, el día vuelve a pedir reporte. Todo queda en Eventos.',
        ],
        nota: 'La app le recuerda al técnico a las 6 de la tarde y a las 9 de la mañana siguiente si le falta un reporte. Cada mañana te llega un resumen con los servicios de días anteriores que siguen abiertos y los días por autorizar.',
      },
      {
        titulo: 'Firma del cliente a distancia',
        resumen: 'Cuando el cliente no estaba en el sitio.',
        pasos: ['Abre el reporte pendiente de firma y toca «Compartir».', 'Se manda un enlace por WhatsApp; el cliente firma desde su teléfono y el reporte se actualiza solo.'],
      },
    ],
  },
  {
    titulo: 'Clientes, cotizaciones y facturación',
    temas: [
      {
        titulo: 'Clientes y proyectos',
        resumen: 'El expediente de cada cliente.',
        pasos: [
          'En Clientes ves sus datos, contactos, proyectos por sistema y todos sus reportes.',
          'Si un técnico escribe un cliente nuevo queda «Por revisar»: confírmalo o únelo con uno existente desde «Duplicados».',
        ],
      },
      {
        titulo: 'Cotizaciones',
        resumen: 'Armarlas, compartirlas y darles seguimiento.',
        pasos: [
          'En «Nueva cotización» agrega las partidas por grupo; el total con IVA se calcula solo.',
          'Para cambiar el orden de los conceptos: arrástralos desde el ícono ⠿, elige otro número en el menú «Partida» (por ejemplo, la 07 pasa a la 01) o usa las flechas ↑ ↓. Las demás partidas se recorren solas.',
          'El «Nombre del proyecto» es opcional: sale como título centrado en la primera página del PDF.',
          'Catálogo de SYSCOM: escribe en la descripción y pulsa Enter (o toca el botón azul «SYSCOM»). Al elegir un producto se llenan la descripción, el costo, la foto y el enlace. También puedes pegar en «Enlace del equipo» un enlace de syscom.mx y se llena solo. «Ver ficha» muestra fotos, características y documentos sin salir de la app.',
          'Para mostrar la foto de cada concepto, activa «Mostrar fotos en el PDF» y usa «Agregar foto» en cada concepto. Los productos de SYSCOM traen su foto.',
          'En «IVA» elige una de tres opciones: «Sumar IVA al total» (el PDF dice «más IVA»), «Los precios ya incluyen IVA» (el total no cambia y el PDF dice «con IVA incluido») o «No lleva IVA» (solo sale el total). La tasa es 16% u 8% para la región fronteriza.',
          'En «Firma» elige quién sale en «Atentamente» del PDF (las personas que aprueban cotizaciones); el nombre y el correo se pueden escribir a mano.',
          'Descarga el PDF o compártelo. Cambia el estado conforme avance: enviada, aprobada, rechazada.',
          'Si aprobaste una cotización y falta corregir algo, usa «Quitar aprobación para corregir»: vuelve a borrador para editarla y luego la firmas otra vez.',
          'Puedes copiar una cotización existente para no empezar de cero.',
        ],
      },
      {
        titulo: 'Facturación',
        resumen: 'Disponible para quien tiene ese permiso.',
        pasos: [
          'En Cotizaciones, Facturas y los proyectos de un cliente, el interruptor «Lista / Tablero» cambia a columnas por estado. Arrastra una tarjeta a otra columna para cambiar su estado; en celular usa «Mover a…». Lo que pide un paso propio no se salta arrastrando: una cotización se aprueba con firma y una factura se timbra registrando su folio fiscal (el tablero te lleva ahí).',
          '«Por facturar» lista, por cliente, los reportes de servicios concluidos que no están en ninguna factura. «Armar factura» abre la prefactura con ese cliente y sus reportes ya elegidos; quita los que no correspondan.',
          'Arma la prefactura con los reportes y conceptos a facturar. Los reportes quedan ligados a la factura y dejan de aparecer como pendientes.',
          'Si un reporte no se va a facturar (garantía, cortesía, póliza), ábrelo y usa «No se va a facturar»: deja de aparecer como pendiente y ya no se ofrece al armar facturas. Se puede revertir.',
          'Cuando se timbre fuera de la app, registra aquí el folio fiscal y, después, el pago.',
        ],
        nota: 'La app no timbra por sí sola: lleva el control de lo facturado y lo pendiente.',
      },
    ],
  },
  {
    titulo: 'Almacén y personal',
    temas: [
      {
        titulo: 'Almacén',
        resumen: 'Existencias, vales y equipo instalado.',
        pasos: [
          '«Vales»: lo que pide el personal para sus servicios; se surte y se firma de recibido.',
          'Después de surtir un vale, si quien lo pidió está contigo abre el vale y toca «Firmar aquí, en este dispositivo» para que firme de recibido en tu pantalla. Si no está, el vale se queda «Por firmar» hasta que firme desde su celular.',
          'Cuando alguien pide más días para devolver, el vale sale en «Piden más días»: ábrelo y aprueba o rechaza. Al aprobar, los días cuentan desde hoy si el plazo ya estaba vencido.',
          '«Existencias» y «Movimientos»: lo que hay y lo que entró o salió. «Entrada» da de alta material nuevo.',
          '«Ubicaciones» y «Conteo» sirven para ordenar el almacén y hacer inventario con etiquetas QR.',
          '«Instalados» guarda qué equipo quedó en cada cliente.',
        ],
      },
      {
        titulo: 'Personal y cuadrillas',
        resumen: 'El equipo, sus grupos y sus solicitudes.',
        pasos: [
          '«Equipo» muestra a cada persona con su puesto y especialidades.',
          '«Cuadrillas» agrupa al personal; cada una puede tener un líder y un supervisor a cargo.',
          '«Solicitudes» es donde autorizas horas extra, vacaciones y permisos.',
          '«Jornadas» muestra en qué se va el tiempo de cada técnico y de cada cuadrilla, por día, semana o mes: trabajo en servicio, traslados, compras, oficina, capacitación, apoyos, comida, pausas y lo que quedó sin registrar. Toca a alguien para ver su día hora por hora.',
          'En «Jornadas» también cambias la hora de entrada y de salida (lunes a viernes). Lo que no tenga registro dentro de ese horario cuenta como «sin registrar»; los días sin ningún registro (vacaciones, faltas) se indican aparte.',
        ],
      },
      {
        titulo: 'Usuarios',
        resumen: 'Altas, roles, permisos y bajas (con permiso de administrar usuarios).',
        pasos: [
          '«Nuevo usuario» crea la cuenta con una contraseña temporal; la persona la cambia al entrar.',
          'Desde su ficha cambias el rol, los permisos o la das de baja.',
          'Una cuenta con historial no se elimina: se da de baja para conservar sus reportes.',
        ],
      },
    ],
  },
  {
    titulo: 'Tu cuenta',
    temas: [
      {
        titulo: 'Asistente',
        resumen: 'Consulta la operación con una pregunta, escribiendo o hablando.',
        pasos: [
          'Toca el botón redondo de la esquina inferior derecha y pregunta, por ejemplo «¿en qué servicio se instaló la cámara DS-2CD1043G2?» o «¿qué servicios de esta semana siguen sin reporte?».',
          'Responde sobre reportes, equipos instalados, servicios, almacén, vales, clientes, cotizaciones y mantenimientos recurrentes.',
          'Con el micrófono puedes preguntar hablando; el botón de la bocina hace que lea las respuestas en voz alta.',
          'Los folios y nombres en color son enlaces: tócalos para abrir ese reporte, servicio o cotización.',
          'Con el botón de la imagen adjuntas hasta 3 fotos (la placa de un equipo, una falla) para que lea marca, modelo o número de serie.',
          'Con el cuadro de texto vacío, el botón principal abre la conversación por voz: hablas, te contesta en voz alta y vuelve a escuchar. Toca el círculo para interrumpirlo; en el botón de ajustes eliges la voz.',
          'El reloj del encabezado abre el historial por día; el lápiz empieza una conversación nueva sin borrar lo anterior.',
          'Si lo abres dentro de una cotización, un servicio, un reporte o un cliente, sabe cuál estás viendo: puedes decir «súbele el margen a esta» o «¿qué más le hemos hecho a este cliente?».',
          'Cuando pregunta algo con pocas respuestas aparecen botones para contestar de un toque, y los pulgares debajo de cada respuesta sirven para decir si ayudó.',
          'También da apoyo técnico: cómo preparar un mantenimiento, qué llevar o cómo configurar un equipo. Primero usa las listas de carga y plantillas de la empresa y, si hace falta, busca en internet y dice de qué sitio lo tomó.',
        ],
        nota: 'Lo que puede hacer además de consultar: agendar, reprogramar o cancelar servicios y crear o modificar borradores de cotización; siempre te pide confirmar antes y no borra nada. Hay un tope de preguntas por persona al día. Incluido en el paquete Empresa.',
      },
      {
        titulo: 'Programar un servicio con el asistente',
        resumen: 'Dile qué, cuándo y con quién; él lo agenda.',
        pasos: [
          'Pídele, por ejemplo, «programa un preventivo de CCTV en Plaza Arboleda el viernes a las 9 con Jorge».',
          'Te pregunta lo que falte, revisa si los técnicos están libres ese día y te ofrece la lista de tareas de la plantilla.',
          'Te muestra el resumen; al confirmarlo agenda el servicio, avisa a los técnicos y te da el enlace para abrirlo.',
        ],
        nota: 'También puede reprogramar (fecha y horario), cambiar los técnicos asignados o cancelar un servicio que no ha empezado: te dice el cambio y te pide confirmar.',
      },
      {
        titulo: 'Cotizar con el asistente',
        resumen: 'Te hace las preguntas necesarias y deja la cotización como borrador.',
        pasos: [
          'Pídele, por ejemplo, «cotiza un sistema fotovoltaico de 16 paneles». Te pregunta el cliente y los datos técnicos que falten.',
          'Te pregunta si el margen de ganancia va igual para todos los conceptos o si lo marcas tú a mano.',
          'Toma precios de cotizaciones anteriores y del almacén (y de SYSCOM cuando esté conectado). Lo que no encuentra lo marca «por confirmar».',
          'Te muestra el resumen; al confirmarlo guarda el borrador y te da el enlace para abrirlo.',
          'Para corregir el borrador puedes pedírselo: «en la COT-0016 cambia el inversor por uno de 6 kW» o «súbele el margen a 20%».',
          'Abre el borrador, revisa partidas y precios, ajusta lo necesario y entonces apruébalo.',
        ],
        nota: 'El borrador muestra el aviso «Cotización generada por IA»: solo se ve en la app, no en el PDF del cliente.',
      },
      {
        titulo: 'Buscar rápido',
        resumen: 'Para saltar a una sección o a un cliente.',
        pasos: ['Usa el buscador de arriba (Ctrl + K en computadora) y escribe el nombre.'],
      },
      {
        titulo: 'Menú lateral (computadora)',
        resumen: 'Las secciones a la izquierda, con sus opciones.',
        pasos: [
          'Toca una sección para abrirla; debajo aparecen sus opciones (por ejemplo Hoy, Agendados, Concluidos) para ir directo a una.',
          'La flecha junto a cada sección muestra u oculta sus opciones sin cambiar de pantalla.',
          'El botón redondo del borde cierra el menú y deja solo los íconos, para tener más espacio. Pasa el cursor por un ícono para ver su nombre y sus opciones. Se queda como lo dejaste.',
        ],
      },
      {
        titulo: 'Tema, vista y notificaciones',
        resumen: 'Ajustes personales.',
        pasos: [
          'El botón de sol o luna cambia entre tema claro y oscuro.',
          'En «Mi perfil → Color de la app» eliges el color de los botones y resaltados (original, verde o azul, morado, terracota). Se guarda en tu cuenta y te sigue en tus otros dispositivos; el logo y los documentos conservan el color de la marca.',
          'En computadora, el botón de al lado cambia las listas entre tarjetas y tabla. La misma opción está en el menú de tu cuenta («Ver listas como tabla»), también para el personal técnico.',
          'Activa las notificaciones para recibir avisos aunque la app esté cerrada.',
        ],
      },
      {
        titulo: 'Suscripción',
        resumen: 'Tu paquete y los días que quedan.',
        pasos: ['En Mi perfil → Suscripción ves el plan actual, los paquetes y los pagos registrados.'],
      },
    ],
  },
];
