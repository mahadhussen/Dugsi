import type { GeneratedMatrixQuestion, MatrigmaCategory } from "./types";

/**
 * Simple Swedish explanations for generated questions. Every rule the
 * generator writes comes from a fixed set of English templates; each template
 * has a Swedish counterpart here. `ruleSv` returns null for text it does not
 * recognise, so a test can check that every generated rule is covered.
 */

const SHAPE: Record<string, string> = {
  circle: "cirkel", square: "kvadrat", triangle: "triangel", pentagon: "femhörning", hexagon: "sexhörning",
  star: "stjärna", diamond: "romb", cross: "kors", arrow: "pil", line: "linje",
};
const DIR: Record<string, string> = {
  up: "uppåt", "up-right": "snett uppåt höger", right: "höger", "down-right": "snett nedåt höger",
  down: "nedåt", "down-left": "snett nedåt vänster", left: "vänster", "up-left": "snett uppåt vänster",
};
const FILL: Record<string, string> = { empty: "tom", "half-filled": "halvfylld", solid: "fylld" };
const ROT: Record<string, string> = { clockwise: "medurs", "counter-clockwise": "moturs" };
const LAYER: Record<string, string> = { "background lines": "bakgrundslinjerna", "thick bars": "de tjocka staplarna", dots: "prickarna" };

const list = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} och ${xs[xs.length - 1]}` : xs[0] ?? "");
const where = (axis: string) => (axis === "row" ? "I varje rad" : "I varje kolumn");
const steps = (n: string) => (n === "1" || n === "one" ? "ett steg" : `${n} steg`);

type Rule = [RegExp, (m: RegExpMatchArray) => string];
const RULES: Rule[] = [
  [/^In each row the figure rotates (\d+)° (clockwise|counter-clockwise) per step\.$/, (m) => `I varje rad vrids figuren ${m[1]}° ${ROT[m[2]]} för varje steg.`],
  [/^Each row contains the orientations (.+) once each\.$/, (m) => `Varje rad har figuren pekande ${list(m[1].split(", ").map((d) => DIR[d] ?? d))}, en gång var.`],
  [/^In each row the fill goes (\S+) → (\S+) → (\S+)\.$/, (m) => `I varje rad går fyllningen ${FILL[m[1]]} → ${FILL[m[2]]} → ${FILL[m[3]]}.`],
  [/^Each row contains ([\d, ]+) objects, once each\.$/, (m) => `Varje rad har ${list(m[1].split(", "))} figurer, en gång var.`],
  [/^In each row the figure (shrinks|grows) step by step\.$/, (m) => `I varje rad blir figuren ${m[1] === "shrinks" ? "mindre" : "större"} för varje steg.`],
  [/^Each row contains an empty, a half-filled and a solid figure\.$/, () => "Varje rad har en tom, en halvfylld och en fylld figur."],
  [/^In each row the figure moves one step (left|right) \(wrapping around\)\.$/, (m) => `I varje rad flyttar figuren ett steg åt ${m[1] === "left" ? "vänster" : "höger"}. Når den kanten börjar den om på andra sidan.`],
  [/^In each row the figure visits the left, middle and right position once each\.$/, () => "I varje rad står figuren en gång till vänster, en gång i mitten och en gång till höger."],
  [/^In each row the number of objects (decreases|increases) by one\.$/, (m) => `I varje rad blir det en figur ${m[1] === "decreases" ? "färre" : "fler"} för varje steg.`],
  [/^In each row the third cell has as many objects as the first two together\.$/, () => "I varje rad har tredje rutan lika många figurer som de två första tillsammans."],
  [/^Each row contains a small, a medium and a large figure\.$/, () => "Varje rad har en liten, en mellanstor och en stor figur."],
  [/^In each row each figure is the previous one mirrored left ↔ right\.$/, () => "I varje rad är varje figur den föregående spegelvänd, vänster blir höger."],
  [/^In each row each figure is the previous one mirrored top ↕ bottom\.$/, () => "I varje rad är varje figur den föregående spegelvänd, upp blir ned."],
  [/^In each row the second figure is the first mirrored (left ↔ right|top ↕ bottom), and the third is the second mirrored (left ↔ right|top ↕ bottom)\.$/, (m) => `I varje rad är andra figuren den första spegelvänd ${m[1].startsWith("left") ? "åt sidan (vänster blir höger)" : "på höjden (upp blir ned)"}, och tredje figuren är den andra spegelvänd ${m[2].startsWith("left") ? "åt sidan" : "på höjden"}.`],
  [/^Each row contains an? (\w+), an? (\w+), an? (\w+) — each exactly once\.$/, (m) => `Varje rad har formerna ${list([m[1], m[2], m[3]].map((s) => SHAPE[s] ?? s))}, en gång var.`],
  [/^In each row the shapes alternate A → B → A\.$/, () => "I varje rad växlar formen: första och tredje rutan har samma form, mittenrutan en annan."],
  [/^In each row the number of corners increases by one .*$/, () => "I varje rad får figuren ett hörn till för varje steg (triangel → fyrhörning → femhörning)."],
  [/^In each row the third cell overlays the first two \(A \+ B = C\)\.$/, () => "I varje rad är tredje rutan de två första lagda ovanpå varandra (A + B = C)."],
  [/^In each row the third cell is the first with the elements of the second removed \(A − B = C\)\.$/, () => "I varje rad är tredje rutan den första, minus allt som finns i den andra (A − B = C)."],
  [/^In each row the third cell keeps the elements that appear in exactly one of the first two \(XOR\)\.$/, () => "I varje rad behåller tredje rutan bara det som finns i en av de två första. Det som finns i båda försvinner (XOR)."],
  [/^In each row the figures alternate A → B → A: the third cell repeats the first\.$/, () => "I varje rad växlar figurerna: tredje rutan är samma som den första."],
  [/^In each (row|column) the (background lines|thick bars|dots) of the last cell are the first two cells laid on top of each other\.$/, (m) => `${where(m[1] === "row" ? "row" : "col")} är ${LAYER[m[2]]} i sista rutan de två första rutorna lagda ovanpå varandra.`],
  [/^In each (row|column) the (background lines|thick bars|dots) of the last cell keep only what appears in exactly one of the first two cells\.$/, (m) => `${where(m[1] === "row" ? "row" : "col")} behåller ${LAYER[m[2]]} i sista rutan bara det som finns i en av de två första rutorna. Det gemensamma försvinner.`],
  [/^In each (row|column) the (background lines|thick bars|dots) of the last cell are the first cell with the second cell's elements removed\.$/, (m) => `${where(m[1] === "row" ? "row" : "col")} är ${LAYER[m[2]]} i sista rutan den första rutan, minus det som finns i den andra.`],
  [/^In each row one square rolls (one|\d+) steps? (clockwise|counter-clockwise) around the rest of the figure, which stays the same\.$/, (m) => `I varje rad rullar en ruta ${steps(m[1])} ${ROT[m[2]]} runt resten av figuren. Resten står still.`],
  [/^(Along each row|Down each column) a petal is added (clockwise|counter-clockwise) at each step\.$/, (m) => `${m[1].startsWith("Along") ? "Längs varje rad" : "Nedåt i varje kolumn"} läggs ett kronblad till ${ROT[m[2]]} för varje steg.`],
  [/^Down each column the flower turns (\d+)° (clockwise|counter-clockwise) and gains a petal (clockwise|counter-clockwise) at each step\.$/, (m) => `Nedåt i varje kolumn vrids blomman ${m[1]}° ${ROT[m[2]]} och får ett kronblad till ${ROT[m[3]]} för varje steg.`],
  [/^Down each column the whole flower turns (\d+)° (clockwise|counter-clockwise) at each step\.$/, (m) => `Nedåt i varje kolumn vrids hela blomman ${m[1]}° ${ROT[m[2]]} för varje steg.`],
  [/^(Lines|Dots): in each (row|column) only what appears in exactly one of the first two cells remains.*$/, (m) => `${m[1] === "Lines" ? "Linjerna" : "Prickarna"}: ${where(m[2] === "row" ? "row" : "col").toLowerCase()} blir bara det kvar som finns i en av de två första rutorna. Det gemensamma försvinner.`],
  [/^(Lines|Dots): in each (row|column) only what appears in both of the first two cells remains\.$/, (m) => `${m[1] === "Lines" ? "Linjerna" : "Prickarna"}: ${where(m[2] === "row" ? "row" : "col").toLowerCase()} blir bara det kvar som finns i båda de två första rutorna.`],
  [/^(Lines|Dots): in each (row|column) what is in the second cell is removed from the first\.$/, (m) => `${m[1] === "Lines" ? "Linjerna" : "Prickarna"}: ${where(m[2] === "row" ? "row" : "col").toLowerCase()} tas det som finns i andra rutan bort från den första.`],
  [/^(Lines|Dots): in each (row|column) everything from the first two cells is combined\.$/, (m) => `${m[1] === "Lines" ? "Linjerna" : "Prickarna"}: ${where(m[2] === "row" ? "row" : "col").toLowerCase()} läggs allt från de två första rutorna ihop.`],
  [/^In each row one cell \(in any position\) is the other two laid on top of each other \(line patterns\)\.$/, () => "I varje rad är en av rutorna, var som helst i raden, de två andra lagda ovanpå varandra (linjemönstren)."],
  [/^The dots follow the same rule: the overlay cell has the dots of both other cells\.$/, () => "Prickarna följer samma regel: den sammanlagda rutan har prickarna från båda de andra."],
  [/^In each row the thick bar marks the position that stays the same; in the two symbol cells the other two symbols swap places\.$/, () => "I varje rad visar den tjocka stapeln vilken plats som står still. I de två andra rutorna byter de två övriga symbolerna plats."],
  [/^Along each row the (black|white) dot moves (\d+) steps? (clockwise|counter-clockwise) around the edge\.$/, (m) => `Längs varje rad flyttar den ${m[1] === "black" ? "svarta" : "vita"} pricken ${steps(m[2])} ${ROT[m[3]]} runt kanten.`],
  [/^The (black|white) dot moves (\d+) steps? (clockwise|counter-clockwise) around the edge\.$/, (m) => `Den ${m[1] === "black" ? "svarta" : "vita"} pricken flyttar ${steps(m[2])} ${ROT[m[3]]} runt kanten.`],
  [/^Along each row the small circle moves (\d+)° (clockwise|counter-clockwise) per step\.$/, (m) => `Längs varje rad flyttar den lilla cirkeln ${m[1]}° ${ROT[m[2]]} för varje steg.`],
  [/^The square stays where it is\.$/, () => "Kvadraten står still."],
  [/^The square moves (\d+)° (clockwise|counter-clockwise) per step\.$/, (m) => `Kvadraten flyttar ${m[1]}° ${ROT[m[2]]} för varje steg.`],
  [/^The square jumps to the opposite side each step\.$/, () => "Kvadraten hoppar till motsatt sida för varje steg."],
  [/^Each row contains the same three figures \(frame with inner lines\), each once\.$/, () => "Varje rad har samma tre ramfigurer (ram med inre linjer), en gång var."],
  [/^Each row contains a small, a medium and a large circle, each once\.$/, () => "Varje rad har en liten, en mellanstor och en stor cirkel, en gång var."],
  [/^Along each row the bar (shrinks|grows) by one third per step\.$/, (m) => `Längs varje rad blir stapeln en tredjedel ${m[1] === "shrinks" ? "kortare" : "längre"} för varje steg.`],
  [/^It stays on the same side and keeps its corner\.$/, () => "Den stannar på samma sida och i samma hörn."],
  [/^Each row contains the three shapes once each, and each shape always has its own number of lines\.$/, () => "Varje rad har de tre formerna en gång var, och varje form har alltid samma antal linjer."],
  [/^Within a row all lines point the same way\.$/, () => "I en rad pekar alla linjer åt samma håll."],
  [/^In each row every band position \(left, middle, right\) shows a different texture in each cell\.$/, () => "I varje rad har varje bandplats (vänster, mitten, höger) ett nytt mönster i varje ruta."],
  [/^Each cell leaves out one of the four textures, and it is a different one in each cell of the row\.$/, () => "Varje ruta saknar ett av de fyra mönstren, och det är ett annat i varje ruta i raden."],
  [/^Each row uses one shape and cuts off the same corner\.$/, () => "Varje rad använder en och samma form och skär av samma hörn."],
  [/^Each row shows the whole shape, the shape with a piece cut off, and that piece fallen to the bottom \(tip up\), in varying order\.$/, () => "Varje rad har tre steg: hela formen, formen med en bit avskuren, och biten som ramlat ned med spetsen uppåt. Stegen kommer i olika ordning i olika rader."],
  [/^Along each row: the whole shape, then the shape with a piece cut off, then that piece fallen to the bottom with its tip up\.$/, () => "Varje rad har tre steg: hela formen, formen med en bit avskuren, och biten som ramlat ned med spetsen uppåt. Stegen kan komma i valfri ordning."],
];

/** Swedish text for one generated rule, or null when the template is unknown. */
export function ruleSv(description: string): string | null {
  for (const [re, f] of RULES) {
    const m = description.match(re);
    if (m) return f(m);
  }
  return null;
}

/** Where to look first, per picture type, in one short sentence. */
export const TIP_SV: Record<MatrigmaCategory, string> = {
  rotation: "Följ en detalj, till exempel en spets, och se åt vilket håll den vrids och hur mycket.",
  reflection: "Jämför rutorna två och två: är den ena en spegelbild av den andra?",
  count: "Räkna figurerna i varje ruta och skriv ned siffrorna rad för rad.",
  position: "Titta var figuren står i rutan och hur den flyttar sig.",
  shape: "Lista formerna i varje rad. Den form som saknas i sista raden är ofta svaret.",
  fill: "Titta bara på fyllningen först: tom, halvfylld eller fylld.",
  size: "Jämför storleken ruta för ruta.",
  direction: "Följ åt vilket håll pilen pekar och hur den vrids.",
  composition: "Lägg de två första rutorna ovanpå varandra i huvudet och jämför med den tredje.",
  alternation: "Jämför första och tredje rutan i varje rad.",
  overlay: "Titta på ett lager i taget: först bakgrundslinjerna, sedan staplarna, sedan prickarna.",
  rolling: "Hitta den del som står still, och följ sedan den ruta som flyttar sig runt den.",
  petals: "Räkna kronbladen och se åt vilket håll blomman vrids.",
  linesdots: "Ta linjerna och prickarna var för sig. De följer ofta olika regler.",
  hatch: "Leta efter den ruta i raden som ser ut som de två andra lagda ovanpå varandra.",
  swap: "Hitta den plats som står still. Resten byter plats.",
  dotpath: "Följ en prick i taget runt kanten och räkna stegen.",
  orbit: "Följ den lilla cirkeln och kvadraten var för sig.",
  emblem: "Titta på ramfiguren och cirkeln var för sig.",
  strip: "Följ stapelns längd och vilken sida den sitter på.",
  lined: "Räkna linjerna i varje form och se åt vilket håll de pekar.",
  bands: "Titta på ett band i taget och jämför mönstren i raden.",
  cutout: "Leta upp hela formen, formen med bit borta och den lösa biten i varje rad.",
  "multi-rule": "Ta en egenskap i taget: form, fyllning, storlek, antal och läge.",
};

/** Plain-language explanation: the rules in Swedish, the answer, and a tip. */
export function explainSv(q: GeneratedMatrixQuestion, answerLabel: string): { rules: string[]; answer: string; tip: string; complete: boolean } {
  const rules = q.rules.map((r) => ruleSv(r.description));
  return {
    rules: rules.map((r, i) => r ?? q.rules[i].description),
    answer: `Bara alternativ ${answerLabel} följer alla reglerna. De andra alternativen bryter mot minst en av dem.`,
    // The main rule decides the tip when it differs from the picture type's usual rule.
    tip: q.rules[0]?.kind === "alt" ? TIP_SV.alternation : q.rules[0]?.kind === "add" ? "Räkna figurerna i de två första rutorna och lägg ihop dem." : TIP_SV[q.category],
    complete: rules.every((r) => r !== null),
  };
}
