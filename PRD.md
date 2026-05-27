# Documento de Requerimientos del Producto (PRD)

## Proyecto: Centralizador de Ofertas de Empleo y Optimización de Perfil (Fase 1)

---

## 1. Visión General del Producto

El producto es una plataforma web que resuelve la fragmentación y la fricción en la búsqueda de empleo. Centraliza vacantes de cuatro bolsas de trabajo principales (LinkedIn, Tecoloco, Computrabajo y Buscojobs), elimina el texto corporativo innecesario mediante resúmenes de IA, clasifica las ofertas con filtros realistas y optimiza el currículum del usuario al formato estándar de Harvard para evadir los filtros automatizados (ATS) de los reclutadores.

---

## 2. Requerimientos Funcionales por Módulo

### Módulo 1: Extracción y Estandarización de Datos (Back-Office)

Este módulo opera en segundo plano para alimentar la plataforma con información limpia.

* **RF 1.1 Centralización de Fuentes:** El sistema debe recolectar de forma automatizada las vacantes de LinkedIn, Tecoloco, Computrabajo y Buscojobs.
* **RF 1.2 Extracción de Datos Críticos:** Por cada vacante, el sistema debe extraer obligatoriamente:
  * Título del puesto.
  * Nombre de la empresa.
  * Ubicación geográfica.
  * Texto completo de la descripción de la oferta.
  * Enlace original de postulación.

* **RF 1.3 Extracción de Contactos Ocultos:** El sistema debe escanear la descripción en busca de correos electrónicos de reclutamiento o instrucciones específicas de envío externo (ej. *"enviar CV a talento@empresa.com"*).
* **RF 1.4 Eliminación de Duplicados:** Si una misma empresa publica exactamente la misma vacante en varias de las plataformas rastreadas, el sistema debe unificarlas en una sola tarjeta, mostrando los enlaces de todas las fuentes disponibles.

---

### Módulo 2: Inteligencia Artificial y Clasificación (Capa de Análisis)

Módulo encargado de procesar la información en bruto utilizando la API de MiniMax para estructurar los datos antes de mostrárselos al usuario.

* **RF 2.1 Generación de Resumen Ejecutivo:** La IA debe transformar las descripciones largas en un resumen corto, directo y estructurado de la oferta (máximo 3-4 viñetas) que explique qué hará el candidato y qué busca la empresa.
* **RF 2.2 Auditoría de Seniority Real:** La IA debe analizar los requisitos de experiencia exigidos en el texto (ej. años de experiencia, responsabilidades) y clasificar la oferta en un nivel real: *Junior, Mid, o Senior*, ignorando si el título de la publicación original contradice estos requisitos.
* **RF 2.3 Ficha Técnica Estructurada:** La IA debe extraer y etiquetar de forma estricta:
  * **Modalidad:** Remoto, Híbrido, o Presencial.
  * **Habilidades/Stack Clave:** Lista limpia de tecnologías o conocimientos indispensables.
  * **Rango Salarial:** Extraerlo únicamente si está explícito o implícito en el texto.

---

### Módulo 3: Interfaz de Usuario y Flujo de Navegación (Front-End)

Define la experiencia interactiva del usuario desde que entra al sitio.

* **RF 3.1 Buscador Público (Sin Registro):** La página de inicio debe presentar una barra de búsqueda abierta donde el usuario pueda ingresar el rol que busca sin necesidad de crear una cuenta o iniciar sesión.
* **RF 3.2 Vista de Resultados Públicos:** El usuario anónimo podrá ver la lista de vacantes centralizadas con sus respectivas Fichas Técnicas (Etiquetas de modalidad, habilidades y Seniority Real).
* **RF 3.3 Bloqueo Estratégico de Aplicación:** Las acciones críticas como "Ver enlace para aplicar", "Copiar correo de reclutamiento" o "Ver resumen de la IA" estarán bloqueadas para usuarios anónimos. Al dar clic en ellas, se debe desplegar la ventana de carga de CV.

---

### Módulo 4: Onboarding Automatizado y Perfil de Usuario

Módulo encargado de registrar al usuario eliminando el llenado manual de formularios.

* **RF 4.1 Registro Vía CV (Drag & Drop):** El usuario desbloquea la plataforma arrastrando su archivo de CV actual (Formatos aceptados: PDF y Word) e ingresando su correo y una contraseña.
* **RF 4.2 Parseo de Perfil por IA:** El sistema debe enviar el CV del usuario a la IA para interpretar y desglosar su perfil de forma automática en:
  * Información de contacto.
  * Historial laboral (Puestos, empresas y duración).
  * Habilidades técnicas y herramientas analizadas.

* **RF 4.3 Creación de Cuenta Invisible:** El sistema guarda los datos extraídos por la IA en el perfil del usuario sin que este haya tenido que escribir una sola línea de texto de su experiencia.

---

### Módulo 5: Motor de Compatibilidad (Matching Engine)

* **RF 5.1 Cálculo de Compatibilidad:** Una vez que el usuario inicia sesión y su CV es procesado, el sistema debe comparar las habilidades y experiencia de su perfil contra los requisitos de las vacantes en la base de datos.
* **RF 5.2 Ordenamiento por Relevancia:** La lista de ofertas del usuario debe ordenarse automáticamente de mayor a menor porcentaje de compatibilidad (ej. *"95% de compatibilidad con tu perfil"*).

---

### Módulo 6: Generador de CV Modelo Harvard

Herramienta de descarga para que el usuario compita contra los filtros automáticos de las empresas.

* **RF 6.1 Plantilla Estándar ATS:** El sistema debe contar con una plantilla prediseñada basada estrictamente en el formato de la Universidad de Harvard:
  * Diseño plano a una sola columna.
  * Sin barras de porcentaje de habilidad, sin iconos, sin fotografías y sin elementos gráficos.
  * Tipografía limpia y márgenes estándar legibles por sistemas automáticos (ATS).

* **RF 6.2 Exportación Instantánea:** El usuario debe tener un botón permanente para **"Descargar CV Optimizado (Harvard)"**. Al presionarlo, el sistema inserta los datos extraídos del perfil del usuario en la plantilla y genera un archivo descargable en formato PDF (o Word editable).

---

## 3. Matriz de Flujo de Pantallas (Resumen de Experiencia)

| Paso | Pantalla / Estado | Acciones del Usuario | Acción del Sistema |
| --- | --- | --- | --- |
| **1** | Landing Page | Digita el puesto en la barra de búsqueda. | Consulta la base de datos de ofertas centralizadas. |
| **2** | Resultados Públicos | Explora tarjetas de empleo; da clic en "Aplicar". | Despliega ventana emergente (Popup) solicitando el CV. |
| **3** | Onboarding / Carga | Sube PDF/Word viejo, ingresa correo y contraseña. | La IA procesa el CV, extrae datos y crea la cuenta. |
| **4** | Panel Privado | Revisa la lista ahora ordenada por compatibilidad. | Muestra los resúmenes de IA, enlaces directos y correos. |
| **5** | Optimización | Da clic en "Descargar CV Harvard". | Genera y descarga el nuevo PDF formateado para evadir filtros. |

---

## 4. Criterios de Aceptación para el Éxito de la Fase 1

1. Un usuario debe ser capaz de encontrar una oferta de cualquiera de las 4 fuentes en un solo buscador en menos de 5 segundos.
2. El resumen generado por la IA no debe superar las 100 palabras por vacante.
3. El proceso completo desde que el usuario arrastra su CV viejo hasta que ve sus ofertas personalizadas y puede descargar su CV Harvard no debe tomar más de 45 segundos en total.