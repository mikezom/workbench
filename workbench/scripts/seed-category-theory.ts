/**
 * Seed script: creates a "Category Theory" group with 10 sample cards.
 * Run with: npx tsx scripts/seed-category-theory.ts
 */

import { promises as fs } from "fs";
import path from "path";
import { createEmptyCard } from "ts-fsrs";

const CARDS_PATH = path.join(__dirname, "..", "data", "cards.json");
const GROUPS_PATH = path.join(__dirname, "..", "data", "groups.json");

interface Group {
  id: string;
  name: string;
  parent_id: string | null;
  settings: { dailyNewLimit: number; dailyReviewLimit: number };
  created_at: string;
}

async function readJSON(p: string) {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8"));
  } catch {
    return [];
  }
}

async function main() {
  const groups: Group[] = await readJSON(GROUPS_PATH);
  const cards = await readJSON(CARDS_PATH);

  // Create group
  const groupId = crypto.randomUUID();
  const now = new Date().toISOString();
  groups.push({
    id: groupId,
    name: "Category Theory",
    parent_id: null,
    settings: { dailyNewLimit: 20, dailyReviewLimit: 100 },
    created_at: now,
  });

  const sampleCards = [
    {
      title: "Category",
      definition:
        "A category C consists of a collection of objects, a collection of morphisms (arrows) between objects, an associative composition operation, and an identity morphism for each object.",
      example:
        "Set is the category whose objects are sets and whose morphisms are functions between sets. The identity morphism is the identity function, and composition is function composition.",
    },
    {
      title: "Functor",
      definition:
        "A functor F: C -> D is a mapping between categories that preserves the structure: it maps objects to objects, morphisms to morphisms, and respects identity and composition.",
      example:
        "The List functor maps a type A to List<A> and a function f: A -> B to map(f): List<A> -> List<B>.",
    },
    {
      title: "Natural Transformation",
      definition:
        "A natural transformation eta: F => G between functors F, G: C -> D is a family of morphisms eta_A: F(A) -> G(A) for each object A in C, such that for every morphism f: A -> B, we have G(f) . eta_A = eta_B . F(f).",
      example:
        "The head function, which extracts the first element of a list, is a natural transformation from the List functor to the Identity functor (for non-empty lists).",
    },
    {
      title: "Adjunction",
      definition:
        "An adjunction between categories C and D consists of functors F: C -> D (left adjoint) and G: D -> C (right adjoint) such that Hom_D(F(A), B) is naturally isomorphic to Hom_C(A, G(B)).",
      example:
        "The free-forgetful adjunction: the free monoid functor (List) is left adjoint to the forgetful functor from monoids to sets.",
    },
    {
      title: "Monad",
      definition:
        "A monad on a category C is an endofunctor T: C -> C together with two natural transformations: unit (eta: Id => T) and multiplication (mu: T^2 => T), satisfying associativity and unit laws.",
      example:
        "The Maybe monad: T(A) = A + 1 (A or Nothing). Unit wraps a value in Just; multiplication flattens Maybe<Maybe<A>> into Maybe<A> by collapsing nested Nothings.",
    },
    {
      title: "Yoneda Lemma",
      definition:
        "For a locally small category C and a functor F: C^op -> Set, the set of natural transformations Nat(Hom(-, A), F) is naturally isomorphic to F(A). Every natural transformation is determined by a single element of F(A).",
      example:
        "For F = Hom(-, B), the Yoneda lemma gives Nat(Hom(-, A), Hom(-, B)) = Hom(A, B), recovering the fact that morphisms A -> B correspond to natural transformations between representable functors.",
    },
    {
      title: "Limit",
      definition:
        "A limit of a diagram D: J -> C is a universal cone over D. It consists of an object L (the limit) and morphisms from L to each object in the diagram, commuting with the diagram's morphisms, and universal among all such cones.",
      example:
        "The product A x B is the limit of the discrete diagram {A, B}. The equalizer of f, g: A -> B is the limit of the parallel pair diagram.",
    },
    {
      title: "Colimit",
      definition:
        "A colimit of a diagram D: J -> C is a universal cocone under D. It is the dual of a limit: morphisms go from objects of the diagram into the colimit object, and it is universal among all cocones.",
      example:
        "The coproduct (disjoint union) A + B is the colimit of the discrete diagram {A, B}. The coequalizer of f, g: A -> B is the colimit of the parallel pair.",
    },
    {
      title: "Kan Extension",
      definition:
        "Given functors K: C -> D and F: C -> E, the left Kan extension Lan_K(F): D -> E is the best approximation of F along K. It satisfies a universal property: Nat(Lan_K F, G) = Nat(F, G . K) for all G: D -> E.",
      example:
        "Colimits are left Kan extensions along the unique functor to the terminal category. The formula Lan_K(F)(d) = colim_{(c, k) in (K downarrow d)} F(c) computes it pointwise.",
    },
    {
      title: "Cartesian Closed Category",
      definition:
        "A cartesian closed category (CCC) is a category with finite products and exponential objects. For every pair of objects A and B, the exponential B^A (the internal hom) exists, with a natural bijection Hom(A x B, C) = Hom(A, C^B).",
      example:
        "Set is cartesian closed: the exponential B^A is the set of functions from A to B. In Haskell, types form a CCC where the exponential is the function type (a -> b).",
    },
  ];

  for (const sc of sampleCards) {
    cards.push({
      id: crypto.randomUUID(),
      front: sc.title,
      back: sc.definition,
      title: sc.title,
      definition: sc.definition,
      example: sc.example,
      source: null,
      group_id: groupId,
      fsrs: createEmptyCard(new Date()),
      created_at: now,
      updated_at: now,
    });
  }

  await fs.writeFile(GROUPS_PATH, JSON.stringify(groups, null, 2));
  await fs.writeFile(CARDS_PATH, JSON.stringify(cards, null, 2));
  console.log(`Created group "Category Theory" (${groupId}) with ${sampleCards.length} cards.`);
}

main().catch(console.error);
