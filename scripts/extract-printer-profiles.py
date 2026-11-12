#!/usr/bin/env python3
"""Extracts the printer profile dataset used by the 3MF Converter
(`/conversor-3mf/`) from the source of a reference tool that declares
`const PERFIS = { key: {"nome":..., "base": {...}}, ... }`.

Writes assets/data/printer-profiles.json in the same shape: profile data only
(name/brand/base settings), none of the original tool's HTML/CSS/JS/texts.

The source may be plain or minified by javascript-obfuscator (strings replaced
by `aj(0x1a2)` calls into a rotated string array). Both are parsed statically;
no JavaScript from the source is executed.

USAGE:
    python3 scripts/extract-printer-profiles.py <source-file>

The source file can be the saved <iframe srcdoc="..."> or the HTML itself.
Run it again whenever you want to update/add printers to the converter.
"""

import ast
import html
import json
import math
import re
import sys

OUTPUT_PATH = "assets/data/printer-profiles.json"


class LiteralParser:
    """Parses a JS object/array literal made of strings, numbers, booleans and
    string-decoder calls like `aj(0x1a2)`."""

    def __init__(self, text, decode=None):
        self.text = text
        self.pos = 0
        self.decode = decode

    def parse(self):
        value = self.value()
        self.skip_ws()
        return value

    def skip_ws(self):
        while self.pos < len(self.text) and self.text[self.pos].isspace():
            self.pos += 1

    def peek(self):
        self.skip_ws()
        return self.text[self.pos] if self.pos < len(self.text) else ""

    def expect(self, token):
        self.skip_ws()
        if not self.text.startswith(token, self.pos):
            raise ValueError(f"expected {token!r} at {self.pos}: {self.text[self.pos:self.pos + 60]!r}")
        self.pos += len(token)

    def value(self):
        c = self.peek()
        if c == "{":
            return self.obj()
        if c == "[":
            return self.arr()
        if c in "'\"":
            return self.string()
        if self.text.startswith("!![]", self.pos):
            self.pos += 4
            return True
        if self.text.startswith("![]", self.pos):
            self.pos += 3
            return False
        m = re.compile(r"-?(0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)").match(self.text, self.pos)
        if m:
            self.pos = m.end()
            n = m.group(0)
            return int(n, 16) if "x" in n else (float(n) if any(ch in n for ch in ".eE") else int(n))
        m = re.compile(r"[A-Za-z_$][\w$]*").match(self.text, self.pos)
        if m:
            word = m.group(0)
            self.pos = m.end()
            if word in ("true", "false", "null"):
                return {"true": True, "false": False, "null": None}[word]
            if self.decode and self.peek() == "(":
                self.expect("(")
                index = self.value()
                self.expect(")")
                return self.decode(index)
        raise ValueError(f"unsupported token at {self.pos}: {self.text[self.pos:self.pos + 60]!r}")

    def string(self):
        quote = self.text[self.pos]
        self.pos += 1
        out = []
        while True:
            c = self.text[self.pos]
            if c == quote:
                self.pos += 1
                return "".join(out)
            if c == "\\":
                self.pos += 1
                e = self.text[self.pos]
                if e == "x":
                    out.append(chr(int(self.text[self.pos + 1:self.pos + 3], 16)))
                    self.pos += 3
                    continue
                if e == "u":
                    out.append(chr(int(self.text[self.pos + 1:self.pos + 5], 16)))
                    self.pos += 5
                    continue
                out.append({"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}.get(e, e))
                self.pos += 1
                continue
            out.append(c)
            self.pos += 1

    def key(self):
        c = self.peek()
        if c in "'\"":
            return self.string()
        m = re.compile(r"[\w$]+").match(self.text, self.pos)
        if not m:
            raise ValueError(f"expected key at {self.pos}")
        self.pos = m.end()
        return m.group(0)

    def obj(self):
        self.expect("{")
        result = {}
        while self.peek() != "}":
            k = self.key()
            self.expect(":")
            result[k] = self.value()
            if self.peek() == ",":
                self.pos += 1
        self.expect("}")
        return result

    def arr(self):
        self.expect("[")
        result = []
        while self.peek() != "]":
            result.append(self.value())
            if self.peek() == ",":
                self.pos += 1
        self.expect("]")
        return result


def balanced_end(text, start):
    """Index just past the bracket that closes the one at `start`."""
    depth = 0
    quote = None
    esc = False
    for i in range(start, len(text)):
        c = text[i]
        if quote:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
        elif c in "{[(":
            depth += 1
        elif c in "}])":
            depth -= 1
            if depth == 0:
                return i + 1
    raise ValueError("unbalanced brackets")


def js_parse_int(s):
    m = re.match(r"\s*([+-]?\d+)", s)
    return int(m.group(1)) if m else math.nan


def eval_arithmetic(expr):
    def ev(node):
        if isinstance(node, ast.Expression):
            return ev(node.body)
        if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            v = ev(node.operand)
            return -v if isinstance(node.op, ast.USub) else v
        if isinstance(node, ast.BinOp):
            a, b = ev(node.left), ev(node.right)
            ops = {ast.Add: a + b, ast.Sub: a - b, ast.Mult: a * b}
            if isinstance(node.op, ast.Div):
                return a / b if b else math.nan
            return ops[type(node.op)]
        raise ValueError(f"unsupported expression: {ast.dump(node)}")

    return ev(ast.parse(expr, mode="eval"))


def build_decoder(text):
    """Rebuilds the javascript-obfuscator string decoder, or returns None when
    the source isn't obfuscated."""
    m = re.search(r"function (\w+)\(\w+,\w+\)\{\w+=\w+-(0x[0-9a-f]+|\d+);const \w+=(\w+)\(\);let \w+=\w+\[\w+\];return \w+;\}", text)
    if not m:
        return None
    offset = int(m.group(2), 0)
    array_fn = m.group(3)

    a = re.search(r"function " + re.escape(array_fn) + r"\(\)\{const \w+=\[", text)
    start = a.end() - 1
    strings = LiteralParser(text[start:balanced_end(text, start)]).parse()

    rot = re.search(r"\(function\(\w+,\w+\)\{const \w+=\w+,\w+=\w+\(\);while\(!!\[\]\)\{try\{const \w+=(.+?);if\(\w+===\w+\)break;", text)
    target = re.search(r"\}\(" + re.escape(array_fn) + r",(0x[0-9a-f]+|\d+)\)\)", text[rot.end():])
    expr = re.sub(r"0x[0-9a-f]+", lambda h: str(int(h.group(0), 16)), rot.group(1))
    goal = int(target.group(1), 0)

    def checksum():
        filled = re.sub(r"parseInt\(\w+\((\d+)\)\)",
                        lambda c: repr(js_parse_int(strings[int(c.group(1)) - offset])).replace("nan", "0/0"),
                        expr)
        return eval_arithmetic(filled)

    for _ in range(len(strings)):
        if checksum() == goal:
            break
        strings.append(strings.pop(0))
    else:
        raise SystemExit("could not reproduce the string array rotation")

    return lambda index: strings[index - offset]


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    with open(sys.argv[1], encoding="utf-8") as f:
        raw = f.read()

    srcdoc = re.search(r'srcdoc="(.*?)"', raw, re.S)
    text = html.unescape(srcdoc.group(1)) if srcdoc else raw

    marker = re.search(r"const PERFIS\s*=\s*\{", text)
    if not marker:
        raise SystemExit("'const PERFIS = {' not found in the source file")

    start = marker.end() - 1
    obj_text = text[start:balanced_end(text, start)]
    profiles = LiteralParser(obj_text, build_decoder(text)).parse()

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(profiles, f, ensure_ascii=False, separators=(",", ":"))

    print(f"{len(profiles)} printers written to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
