#!/usr/bin/env python3
"""Convierte los bloques de un DXF de simbología en lib/simbolosBiblioteca.ts.

Uso:  python3 scripts/lazos/simbolos-de-dxf.py Simbologia.dxf > lib/simbolosBiblioteca.ts

Cada bloque queda centrado en (0,0), con radio 1 y la y hacia abajo (como el
SVG), en trazos M/L/A/Z: lo mismo que entiende lib/simbolosPlano.ts.
"""
import json
import math
import sys

MUESTRAS_ARCO = 12  # puntos para medir la caja de un arco


def leer_bloques(ruta):
    lineas = [l.rstrip('\r\n') for l in open(ruta, encoding='utf-8', errors='replace')]
    pares = [(lineas[i].strip(), lineas[i + 1].strip()) for i in range(0, len(lineas) - 1, 2)]
    entidades, actual = [], None
    for codigo, valor in pares:
        if codigo == '0':
            if actual:
                entidades.append(actual)
            actual = [('0', valor)]
        elif actual is not None:
            actual.append((codigo, valor))
    bloques, seccion, nombre = {}, None, None
    for e in entidades:
        tipo = e[0][1]
        if tipo == 'SECTION':
            seccion = dict(e).get('2')
        if seccion != 'BLOCKS':
            continue
        if tipo == 'BLOCK':
            nombre = dict(e).get('2')
            bloques[nombre] = []
        elif tipo == 'ENDBLK':
            nombre = None
        elif nombre:
            bloques[nombre].append(e)
    return {n: b for n, b in bloques.items() if b and not n.startswith(('*', '_'))}


def numeros(e, codigo):
    return [float(v) for c, v in e if c == codigo]


def uno(e, codigo, omision=0.0):
    valores = numeros(e, codigo)
    return valores[0] if valores else omision


# ---- Figuras intermedias: lista de tramos en coordenadas del DXF ----
# Un camino es {'pasos': [('M',x,y) | ('L',x,y) | ('A',r,grande,antihorario,x,y)], 'cerrado', 'clase'}
# clase: 'linea' (solo trazo), 'cerrado' (contorno con fondo blanco), 'relleno' (sólido).

def circulo(cx, cy, r):
    return [('M', cx - r, cy), ('A', r, 1, 1, cx + r, cy), ('A', r, 1, 1, cx - r, cy)]


def con_curvas(vertices, cerrado):
    """vertices: [(x, y, bulge)]. El bulge es la curva hacia el siguiente."""
    pasos = [('M', vertices[0][0], vertices[0][1])]
    n = len(vertices)
    for i in range(n if cerrado else n - 1):
        x0, y0, b = vertices[i]
        x1, y1, _ = vertices[(i + 1) % n]
        if abs(b) < 1e-9:
            if not (cerrado and i == n - 1):
                pasos.append(('L', x1, y1))
        else:
            cuerda = math.hypot(x1 - x0, y1 - y0)
            radio = cuerda * (1 + b * b) / (4 * abs(b))
            pasos.append(('A', radio, 1 if abs(b) > 1 else 0, 1 if b > 0 else 0, x1, y1))
    return pasos


def vertices_de(e, desde=0):
    """Pares 10/20 con su 42 (bulge) de una LWPOLYLINE o un borde de HATCH."""
    vertices = []
    for c, v in e[desde:]:
        if c == '10':
            vertices.append([float(v), 0.0, 0.0])
        elif c == '20' and vertices:
            vertices[-1][1] = float(v)
        elif c == '42' and vertices:
            vertices[-1][2] = float(v)
    return vertices


def caminos_de(e):
    tipo = e[0][1]
    if tipo == 'CIRCLE':
        return [{'pasos': circulo(uno(e, '10'), uno(e, '20'), uno(e, '40')), 'cerrado': True, 'clase': 'cerrado'}]
    if tipo == 'LINE':
        return [{'pasos': [('M', uno(e, '10'), uno(e, '20')), ('L', uno(e, '11'), uno(e, '21'))], 'cerrado': False, 'clase': 'linea'}]
    if tipo == 'ARC':
        cx, cy, r = uno(e, '10'), uno(e, '20'), uno(e, '40')
        a0, a1 = math.radians(uno(e, '50')), math.radians(uno(e, '51'))
        barrido = (a1 - a0) % (2 * math.pi)
        inicio = ('M', cx + r * math.cos(a0), cy + r * math.sin(a0))
        fin = ('A', r, 1 if barrido > math.pi else 0, 1, cx + r * math.cos(a1), cy + r * math.sin(a1))
        return [{'pasos': [inicio, fin], 'cerrado': False, 'clase': 'linea'}]
    if tipo == 'LWPOLYLINE':
        cerrado = int(uno(e, '70')) & 1 == 1
        return [{'pasos': con_curvas(vertices_de(e), cerrado), 'cerrado': cerrado, 'clase': 'cerrado' if cerrado else 'linea'}]
    if tipo == 'SOLID':
        xs, ys = [uno(e, c) for c in ('10', '11', '13', '12')], [uno(e, c) for c in ('20', '21', '23', '22')]
        pasos = [('M', xs[0], ys[0])] + [('L', x, y) for x, y in zip(xs[1:], ys[1:])]
        return [{'pasos': pasos, 'cerrado': True, 'clase': 'relleno', 'aci': int(uno(e, '62'))}]
    if tipo == 'HATCH':
        # Solo bordes de polilínea (92 con el bit 2), que es lo que trae la simbología.
        pasos = []
        indices = [i for i, (c, _) in enumerate(e) if c == '92']
        for n, i in enumerate(indices):
            fin = indices[n + 1] if n + 1 < len(indices) else len(e)
            tramo = [p for p in e[i:fin]]
            corte = next((k for k, (c, _) in enumerate(tramo) if c == '97'), len(tramo))
            vertices = vertices_de(tramo[:corte])
            if len(vertices) >= 2:
                pasos += con_curvas(vertices, True) + [('Z',)]
        return [{'pasos': pasos, 'cerrado': False, 'clase': 'relleno', 'aci': int(uno(e, '62'))}] if pasos else []
    return []


def letra_de(e):
    alto = uno(e, '40')
    texto = dict(e).get('1', '')
    horizontal, vertical = int(uno(e, '72')), int(uno(e, '73'))
    ancho = len(texto) * alto * 0.85  # ancho aproximado de la letra gruesa
    if horizontal or vertical:
        x, y = uno(e, '11'), uno(e, '21')
        if horizontal == 0:
            x += ancho / 2
        elif horizontal == 2:
            x -= ancho / 2
        if vertical in (0, 1):
            y += alto / 2
        elif vertical == 3:
            y -= alto / 2
    else:
        x, y = uno(e, '10') + ancho / 2, uno(e, '20') + alto / 2
    return {'texto': texto, 'x': x, 'y': y, 'alto': alto, 'ancho': ancho}


def puntos_de(pasos):
    """Puntos para medir la caja (los arcos, muestreados)."""
    puntos, anterior = [], None
    for p in pasos:
        if p[0] == 'Z':
            continue
        if p[0] == 'A' and anterior:
            _, r, grande, antihorario, x, y = p
            x0, y0 = anterior
            mx, my = (x0 + x) / 2, (y0 + y) / 2
            media = math.hypot(x - x0, y - y0) / 2
            h = math.sqrt(max(r * r - media * media, 0))
            ux, uy = (-(y - y0), x - x0)
            largo = math.hypot(ux, uy) or 1
            signo = 1 if (grande != antihorario) else -1  # el centro queda a la izquierda de la cuerda en un arco corto antihorario
            cx, cy = mx + signo * h * ux / largo, my + signo * h * uy / largo
            a0, a1 = math.atan2(y0 - cy, x0 - cx), math.atan2(y - cy, x - cx)
            barrido = (a1 - a0) % (2 * math.pi) if antihorario else -((a0 - a1) % (2 * math.pi))
            for k in range(1, MUESTRAS_ARCO + 1):
                t = a0 + barrido * k / MUESTRAS_ARCO
                puntos.append((cx + r * math.cos(t), cy + r * math.sin(t)))
        else:
            puntos.append((p[-2], p[-1]))
        anterior = (p[-2], p[-1])
    return puntos


def n(valor):
    texto = f'{valor:.3f}'.rstrip('0').rstrip('.')
    return '0' if texto in ('-0', '') else texto


def convertir(entidades):
    caminos, letras = [], []
    for e in entidades:
        if e[0][1] == 'TEXT':
            letras.append(letra_de(e))
        else:
            caminos += caminos_de(e)
    xs, ys = [], []
    for c in caminos:
        for x, y in puntos_de(c['pasos']):
            xs.append(x)
            ys.append(y)
    for l in letras:
        xs += [l['x'] - l['ancho'] / 2, l['x'] + l['ancho'] / 2]
        ys += [l['y'] - l['alto'] / 2, l['y'] + l['alto'] / 2]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    k = 1 / (max(max(xs) - min(xs), max(ys) - min(ys)) / 2)
    X = lambda x: n((x - cx) * k)
    Y = lambda y: n(-(y - cy) * k)  # la y del SVG va hacia abajo

    # Solo el contorno más grande lleva fondo blanco, y va al fondo para no
    # tapar nada; los demás contornos quedan como línea.
    def tamano(c):
        puntos = puntos_de(c['pasos'])
        return (max(x for x, _ in puntos) - min(x for x, _ in puntos)) * (max(y for _, y in puntos) - min(y for _, y in puntos))
    contornos = [c for c in caminos if c['clase'] == 'cerrado']
    fondo = max(contornos, key=tamano) if contornos else None
    for c in contornos:
        if c is not fondo:
            c['clase'] = 'linea'
    if fondo:
        caminos.remove(fondo)
        caminos.insert(0, fondo)

    trazos = []
    for c in caminos:
        partes = []
        for p in c['pasos']:
            if p[0] == 'Z':
                partes.append('Z')
            elif p[0] == 'A':
                # Al voltear la y, el sentido antihorario del DXF es «0» en SVG.
                partes.append(f'A {n(p[1] * k)} {n(p[1] * k)} 0 {p[2]} {0 if p[3] else 1} {X(p[4])} {Y(p[5])}')
            else:
                partes.append(f'{p[0]} {X(p[1])} {Y(p[2])}')
        if c['cerrado']:
            partes.append('Z')
        trazo = {'d': ' '.join(partes), 'clase': c['clase']}
        # El verde (3) es la pantalla del panel; lo demás toma el color del equipo.
        if c.get('aci') == 3:
            trazo['color'] = '#22c55e'
        # El 7 de AutoCAD es blanco sobre fondo negro.
        if c.get('aci') == 7:
            trazo['color'] = '#ffffff'
        trazos.append(trazo)
    salida_letras = [{'texto': l['texto'], 'x': float(X(l['x'])), 'y': float(Y(l['y'])), 'tam': round(l['alto'] * k * 1.3, 3)} for l in letras]
    return {'trazos': trazos, 'letras': salida_letras}


def main():
    bloques = leer_bloques(sys.argv[1])
    print('// GENERADO por scripts/lazos/simbolos-de-dxf.py a partir de la simbología')
    print('// de AutoCAD de Clave (Simbologia_deteccion_incendio.dxf). No editar a mano:')
    print('// se cambia el bloque en AutoCAD y se vuelve a generar.')
    print('//')
    print('// Cada bloque está centrado en (0,0), mide 1 de radio y va con la y hacia')
    print('// abajo. clase: «linea» = solo trazo; «cerrado» = contorno con fondo')
    print('// blanco; «relleno» = sólido del color del equipo (o de `color`).')
    print()
    print("export type TrazoBloque = { d: string; clase: 'linea' | 'cerrado' | 'relleno'; color?: string };")
    print('export type LetraBloque = { texto: string; x: number; y: number; tam: number };')
    print('export type Bloque = { trazos: TrazoBloque[]; letras: LetraBloque[] };')
    print()
    print('export const BLOQUES: Record<string, Bloque> = {')
    for nombre, entidades in bloques.items():
        print(f'  {json.dumps(nombre)}: {json.dumps(convertir(entidades), ensure_ascii=False)},')
    print('};')


main()
