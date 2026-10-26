/**
 * Generic Big-Five style model used for MAP-like practice statements.
 * The subscale names are generic trait facets written for this tool; they are
 * not taken from any commercial instrument.
 *
 * IMPORTANT: there is no "correct" answer to a personality statement. This
 * model is used only to explain what a statement is about.
 */

export const LIKERT = [
  { value: 1, label: "Strongly disagree", sv: "Instämmer inte alls" },
  { value: 2, label: "Disagree", sv: "Instämmer inte" },
  { value: 3, label: "Somewhat disagree", sv: "Instämmer delvis inte" },
  { value: 4, label: "Neutral", sv: "Neutral" },
  { value: 5, label: "Somewhat agree", sv: "Instämmer delvis" },
  { value: 6, label: "Agree", sv: "Instämmer" },
  { value: 7, label: "Strongly agree", sv: "Instämmer helt" },
] as const;

export type DomainKey = "extraversion" | "agreeableness" | "conscientiousness" | "stability" | "openness";

export interface Subscale {
  key: string;
  domain: DomainKey;
  name: string;
  sv: string;
  /** What behaviour a high level of agreement typically describes. */
  high: string;
  /** What behaviour a low level of agreement typically describes. */
  low: string;
  keywords: string[];
}

export interface Domain {
  key: DomainKey;
  name: string;
  sv: string;
  description: string;
}

export const DOMAINS: Domain[] = [
  { key: "extraversion", name: "Extraversion", sv: "Extraversion", description: "How much energy you draw from people, activity and stimulation." },
  { key: "agreeableness", name: "Agreeableness", sv: "Samarbetsvilja", description: "How you relate to others: trust, cooperation and consideration." },
  { key: "conscientiousness", name: "Conscientiousness", sv: "Noggrannhet", description: "How you organise work, follow through and plan ahead." },
  { key: "stability", name: "Emotional Stability", sv: "Emotionell stabilitet", description: "How you handle pressure, setbacks and strong emotions." },
  { key: "openness", name: "Openness", sv: "Öppenhet", description: "How you approach ideas, change, creativity and new experiences." },
];

export const SUBSCALES: Subscale[] = [
  // Extraversion
  { key: "sociability", domain: "extraversion", name: "Sociability", sv: "Social", high: "Seeks out company and enjoys meeting new people.", low: "Prefers smaller groups or working alone; recharges in quiet.", keywords: ["människor", "folk", "sällskap", "träffa", "social", "fest", "mingla", "people", "party", "company", "socialize", "vänner", "friends", "grupp"] },
  { key: "assertiveness", domain: "extraversion", name: "Assertiveness", sv: "Självhävdelse", high: "Takes the lead, speaks up and makes their views heard.", low: "Lets others lead; contributes more quietly.", keywords: ["leda", "ledare", "ta befälet", "säga ifrån", "åsikt", "ta plats", "lead", "leader", "in charge", "speak up", "bestämma", "övertyga", "persuade"] },
  { key: "activity", domain: "extraversion", name: "Activity level", sv: "Aktivitet", high: "Likes a high tempo and having many things going on.", low: "Prefers a calm, steady pace.", keywords: ["tempo", "fart", "aktiv", "sysselsatt", "många saker", "busy", "active", "pace", "energi", "energy", "högt tempo"] },
  { key: "excitement", domain: "extraversion", name: "Excitement seeking", sv: "Spänningssökande", high: "Enjoys thrills, risk and intense experiences.", low: "Prefers the predictable and safe.", keywords: ["spänning", "äventyr", "risk", "utmaning", "adrenalin", "thrill", "adventure", "excitement", "spännande"] },
  { key: "cheerfulness", domain: "extraversion", name: "Positive emotions", sv: "Entusiasm", high: "Often expresses joy and enthusiasm.", low: "Is more reserved in expressing positive feelings.", keywords: ["glad", "entusiastisk", "skratta", "glädje", "positiv", "cheerful", "enthusiastic", "happy", "laugh", "humör"] },
  // Agreeableness
  { key: "trust", domain: "agreeableness", name: "Trust", sv: "Tillit", high: "Assumes others have good intentions.", low: "Is more sceptical and checks others' motives.", keywords: ["lita", "tillit", "förtroende", "ärliga", "avsikter", "trust", "honest", "intentions", "misstänksam", "suspicious"] },
  { key: "cooperation", domain: "agreeableness", name: "Cooperation", sv: "Samarbete", high: "Seeks consensus and avoids unnecessary conflict.", low: "Is comfortable with confrontation and competition.", keywords: ["samarbete", "samarbeta", "konflikt", "kompromiss", "enighet", "cooperate", "conflict", "compromise", "team", "gräl", "argue", "tävla", "compete"] },
  { key: "altruism", domain: "agreeableness", name: "Helpfulness", sv: "Hjälpsamhet", high: "Readily helps others, even at a personal cost.", low: "Prioritises own tasks and boundaries.", keywords: ["hjälpa", "hjälpsam", "ställa upp", "stötta", "help", "support", "assist", "andras behov", "others' needs"] },
  { key: "modesty", domain: "agreeableness", name: "Modesty", sv: "Anspråkslöshet", high: "Downplays own achievements.", low: "Is comfortable highlighting own strengths.", keywords: ["skryta", "prestationer", "uppmärksamhet", "ödmjuk", "brag", "modest", "humble", "attention", "framhäva"] },
  { key: "empathy", domain: "agreeableness", name: "Empathy", sv: "Empati", high: "Notices and cares about how others feel.", low: "Focuses more on facts and tasks than on feelings.", keywords: ["känslor", "känner", "empati", "medkänsla", "förstå hur", "feelings", "empathy", "compassion", "sympathy", "andra mår"] },
  // Conscientiousness
  { key: "order", domain: "conscientiousness", name: "Orderliness", sv: "Ordning", high: "Keeps things structured, tidy and systematic.", low: "Is comfortable with some mess and flexible structure.", keywords: ["ordning", "struktur", "städa", "system", "organiserad", "prydlig", "order", "tidy", "organized", "organised", "structure", "rörigt", "messy"] },
  { key: "dutifulness", domain: "conscientiousness", name: "Dutifulness", sv: "Pliktkänsla", high: "Keeps promises and follows rules closely.", low: "Interprets rules and commitments more freely.", keywords: ["regler", "löften", "plikt", "ansvar", "håller vad", "rules", "promise", "duty", "responsib", "deadline", "i tid", "on time"] },
  { key: "achievement", domain: "conscientiousness", name: "Achievement striving", sv: "Målinriktning", high: "Sets high goals and works hard to reach them.", low: "Is content with 'good enough' and a balanced effort.", keywords: ["mål", "prestera", "ambitiös", "ambition", "högt ställda", "goals", "achieve", "ambitious", "excel", "bäst", "best"] },
  { key: "discipline", domain: "conscientiousness", name: "Self-discipline", sv: "Självdisciplin", high: "Finishes tasks even when they are boring.", low: "Easily gets distracted or postpones tasks.", keywords: ["skjuter upp", "slutföra", "fokus", "disciplin", "distraherad", "procrastinat", "finish", "complete", "focus", "discipline", "tråkiga", "boring"] },
  { key: "deliberation", domain: "conscientiousness", name: "Planning & deliberation", sv: "Planering", high: "Plans carefully and thinks before acting.", low: "Acts spontaneously and decides quickly.", keywords: ["planera", "planerar", "plan", "noggrant", "eftertanke", "impulsiv", "spontan", "plan", "careful", "impulsive", "spontaneous", "think before", "förbereder", "prepare"] },
  // Emotional stability
  { key: "calm", domain: "stability", name: "Calmness", sv: "Lugn", high: "Rarely worries; stays calm.", low: "Worries more often and can feel tense.", keywords: ["oroar", "orolig", "oro", "nervös", "lugn", "worry", "worried", "anxious", "nervous", "calm", "ängslig"] },
  { key: "stress", domain: "stability", name: "Stress tolerance", sv: "Stresstålighet", high: "Performs well under pressure.", low: "Is more affected by pressure and tight deadlines.", keywords: ["stress", "press", "tryck", "pressade", "stressad", "pressure", "stressed", "overwhelm", "kaos", "chaos"] },
  { key: "confidence", domain: "stability", name: "Self-confidence", sv: "Självsäkerhet", high: "Feels secure in own abilities.", low: "Doubts own abilities more often.", keywords: ["självsäker", "tvivlar", "osäker", "förmåga", "självförtroende", "confident", "doubt", "insecure", "ability", "tilltro"] },
  { key: "control", domain: "stability", name: "Emotional control", sv: "Känslokontroll", high: "Keeps emotions in check even when provoked.", low: "Reacts strongly and visibly to frustration.", keywords: ["irriterad", "arg", "ilska", "tappar", "humöret", "frustrerad", "angry", "irritated", "temper", "frustrat", "provoc", "känslor styra"] },
  { key: "resilience", domain: "stability", name: "Resilience", sv: "Återhämtning", high: "Bounces back quickly after setbacks.", low: "Needs more time to recover from setbacks.", keywords: ["motgång", "misslyckande", "återhämta", "komma igen", "kritik", "setback", "failure", "recover", "bounce back", "criticism", "nedstämd"] },
  // Openness
  { key: "imagination", domain: "openness", name: "Imagination", sv: "Fantasi", high: "Enjoys daydreaming and creative ideas.", low: "Prefers concrete and practical thinking.", keywords: ["fantasi", "kreativ", "idéer", "dagdrömma", "creative", "imagination", "ideas", "daydream", "uppfinna"] },
  { key: "curiosity", domain: "openness", name: "Intellectual curiosity", sv: "Nyfikenhet", high: "Likes learning new things and exploring ideas.", low: "Focuses on what is known and useful here and now.", keywords: ["nyfiken", "lära", "lär mig", "kunskap", "utforska", "curious", "learn", "knowledge", "explore", "förstå hur saker"] },
  { key: "change", domain: "openness", name: "Openness to change", sv: "Förändringsvilja", high: "Welcomes change and new ways of working.", low: "Prefers proven routines and stability.", keywords: ["förändring", "förändringar", "rutiner", "nya sätt", "variation", "change", "routine", "new ways", "variety", "traditioner", "tradition"] },
  { key: "aesthetics", domain: "openness", name: "Aesthetics", sv: "Estetik", high: "Appreciates art, music, design and beauty.", low: "Pays less attention to aesthetic experiences.", keywords: ["konst", "musik", "design", "skönhet", "estetik", "art", "music", "beauty", "aesthetic", "poesi"] },
  { key: "analysis", domain: "openness", name: "Analytical thinking", sv: "Analytiskt tänkande", high: "Enjoys complex problems and abstract reasoning.", low: "Prefers straightforward, hands-on problems.", keywords: ["analysera", "problem", "komplexa", "abstrakt", "teorier", "analy", "complex", "abstract", "theor", "logik", "logic", "klura"] },
];

export function subscale(key: string): Subscale | undefined {
  return SUBSCALES.find((s) => s.key === key);
}

export function domain(key: string): Domain | undefined {
  return DOMAINS.find((d) => d.key === key);
}
