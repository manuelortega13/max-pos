/**
 * Curated emoji palette for the product "Icon fallback" picker. Each
 * entry carries a primary `name` (what shows in the dropdown) and
 * an optional `aliases` list of extra search terms so a cashier
 * typing "soda" finds the cup emoji even though its formal name is
 * "cup with straw".
 *
 * Keep this list tight and product-centric. The whole point of the
 * picker is "I want a visual for this product"; a 2000-emoji list
 * just buries the useful ones. Add new entries here when a real
 * product category surfaces a gap.
 */
export interface ProductIcon {
  readonly char: string;
  readonly name: string;
  readonly aliases?: readonly string[];
}

export const PRODUCT_ICONS: readonly ProductIcon[] = [
  // ── Drinks ───────────────────────────────────────────────────
  { char: '🥤', name: 'Cup with straw', aliases: ['soda', 'drink', 'soft drink', 'cola'] },
  { char: '🧃', name: 'Juice box', aliases: ['juice', 'drink'] },
  { char: '🍹', name: 'Tropical drink', aliases: ['cocktail', 'beach'] },
  { char: '🍸', name: 'Martini', aliases: ['cocktail'] },
  { char: '🍷', name: 'Wine glass', aliases: ['wine', 'red wine'] },
  { char: '🍺', name: 'Beer mug', aliases: ['beer', 'ale'] },
  { char: '🍻', name: 'Clinking beers', aliases: ['beer', 'cheers'] },
  { char: '🥂', name: 'Clinking glasses', aliases: ['champagne', 'cheers', 'toast'] },
  { char: '🍶', name: 'Sake', aliases: ['sake', 'rice wine'] },
  { char: '🍵', name: 'Teacup', aliases: ['tea', 'green tea'] },
  { char: '☕', name: 'Coffee', aliases: ['coffee', 'espresso', 'hot drink'] },
  { char: '🥛', name: 'Glass of milk', aliases: ['milk', 'dairy'] },
  { char: '💧', name: 'Water drop', aliases: ['water', 'bottled water'] },
  { char: '🧊', name: 'Ice cube', aliases: ['ice', 'cold'] },
  { char: '🥃', name: 'Tumbler glass', aliases: ['whiskey', 'liquor', 'spirit'] },
  // ── Bakery ──────────────────────────────────────────────────
  { char: '🍞', name: 'Bread', aliases: ['loaf', 'bakery'] },
  { char: '🥖', name: 'Baguette', aliases: ['bread', 'french bread'] },
  { char: '🥐', name: 'Croissant', aliases: ['pastry', 'bakery'] },
  { char: '🥯', name: 'Bagel', aliases: ['bakery'] },
  { char: '🧇', name: 'Waffle', aliases: ['breakfast'] },
  { char: '🥞', name: 'Pancakes', aliases: ['breakfast'] },
  { char: '🍩', name: 'Donut', aliases: ['doughnut', 'pastry'] },
  { char: '🍪', name: 'Cookie', aliases: ['biscuit'] },
  { char: '🎂', name: 'Birthday cake', aliases: ['cake'] },
  { char: '🍰', name: 'Cake slice', aliases: ['cake', 'shortcake'] },
  { char: '🧁', name: 'Cupcake', aliases: ['muffin'] },
  { char: '🥧', name: 'Pie', aliases: ['dessert'] },
  // ── Snacks & Candy ──────────────────────────────────────────
  { char: '🍟', name: 'French fries', aliases: ['fries', 'chips', 'snack'] },
  { char: '🥨', name: 'Pretzel', aliases: ['snack'] },
  { char: '🥜', name: 'Peanuts', aliases: ['nuts', 'snack'] },
  { char: '🍫', name: 'Chocolate bar', aliases: ['chocolate', 'candy', 'sweet'] },
  { char: '🍬', name: 'Candy', aliases: ['sweet', 'sugar'] },
  { char: '🍭', name: 'Lollipop', aliases: ['candy', 'sweet'] },
  { char: '🍿', name: 'Popcorn', aliases: ['snack', 'cinema'] },
  { char: '🍡', name: 'Dango', aliases: ['sweet', 'japanese'] },
  // ── Meals ───────────────────────────────────────────────────
  { char: '🍔', name: 'Hamburger', aliases: ['burger', 'fast food'] },
  { char: '🌭', name: 'Hot dog', aliases: ['frankfurter', 'sausage'] },
  { char: '🥪', name: 'Sandwich', aliases: ['sub'] },
  { char: '🌮', name: 'Taco', aliases: ['mexican'] },
  { char: '🌯', name: 'Burrito', aliases: ['mexican', 'wrap'] },
  { char: '🍕', name: 'Pizza', aliases: ['italian'] },
  { char: '🍝', name: 'Spaghetti', aliases: ['pasta', 'italian'] },
  { char: '🍜', name: 'Ramen', aliases: ['noodles', 'soup'] },
  { char: '🍣', name: 'Sushi', aliases: ['japanese'] },
  { char: '🍱', name: 'Bento box', aliases: ['lunch', 'japanese'] },
  { char: '🍙', name: 'Rice ball', aliases: ['onigiri', 'japanese'] },
  { char: '🍚', name: 'Cooked rice', aliases: ['rice'] },
  { char: '🍛', name: 'Curry', aliases: ['rice'] },
  { char: '🥗', name: 'Salad', aliases: ['greens', 'healthy'] },
  { char: '🍲', name: 'Pot of food', aliases: ['stew', 'soup'] },
  { char: '🍳', name: 'Egg cooking', aliases: ['fried egg', 'breakfast'] },
  { char: '🥘', name: 'Paella', aliases: ['shallow pan', 'rice'] },
  { char: '🍗', name: 'Chicken leg', aliases: ['chicken', 'drumstick'] },
  { char: '🍖', name: 'Meat on bone', aliases: ['meat', 'bbq'] },
  { char: '🥩', name: 'Cut of meat', aliases: ['steak', 'beef'] },
  { char: '🥓', name: 'Bacon', aliases: ['breakfast', 'meat'] },
  { char: '🍤', name: 'Fried shrimp', aliases: ['prawn', 'tempura'] },
  // ── Produce ─────────────────────────────────────────────────
  { char: '🍎', name: 'Red apple', aliases: ['apple', 'fruit'] },
  { char: '🍏', name: 'Green apple', aliases: ['apple', 'fruit'] },
  { char: '🍌', name: 'Banana', aliases: ['fruit'] },
  { char: '🍊', name: 'Orange', aliases: ['fruit', 'citrus', 'tangerine'] },
  { char: '🍋', name: 'Lemon', aliases: ['fruit', 'citrus'] },
  { char: '🍇', name: 'Grapes', aliases: ['fruit'] },
  { char: '🍓', name: 'Strawberry', aliases: ['berry', 'fruit'] },
  { char: '🫐', name: 'Blueberries', aliases: ['berry', 'fruit'] },
  { char: '🍉', name: 'Watermelon', aliases: ['fruit', 'summer'] },
  { char: '🍑', name: 'Peach', aliases: ['fruit'] },
  { char: '🍒', name: 'Cherries', aliases: ['fruit'] },
  { char: '🥭', name: 'Mango', aliases: ['fruit', 'tropical'] },
  { char: '🍍', name: 'Pineapple', aliases: ['fruit', 'tropical'] },
  { char: '🥥', name: 'Coconut', aliases: ['fruit', 'tropical'] },
  { char: '🥝', name: 'Kiwi', aliases: ['fruit'] },
  { char: '🍅', name: 'Tomato', aliases: ['vegetable', 'fruit'] },
  { char: '🥕', name: 'Carrot', aliases: ['vegetable', 'root'] },
  { char: '🌽', name: 'Corn', aliases: ['vegetable', 'maize'] },
  { char: '🥦', name: 'Broccoli', aliases: ['vegetable'] },
  { char: '🥬', name: 'Leafy green', aliases: ['vegetable', 'lettuce', 'cabbage'] },
  { char: '🧅', name: 'Onion', aliases: ['vegetable'] },
  { char: '🧄', name: 'Garlic', aliases: ['vegetable'] },
  { char: '🌶️', name: 'Hot pepper', aliases: ['chili', 'spicy'] },
  { char: '🫑', name: 'Bell pepper', aliases: ['vegetable', 'capsicum'] },
  { char: '🥔', name: 'Potato', aliases: ['vegetable', 'tuber'] },
  { char: '🍆', name: 'Eggplant', aliases: ['vegetable', 'aubergine'] },
  { char: '🥒', name: 'Cucumber', aliases: ['vegetable'] },
  { char: '🫘', name: 'Beans', aliases: ['legume'] },
  { char: '🥑', name: 'Avocado', aliases: ['fruit'] },
  { char: '🍄', name: 'Mushroom', aliases: ['fungus'] },
  // ── Dairy & Eggs ────────────────────────────────────────────
  { char: '🧀', name: 'Cheese', aliases: ['dairy'] },
  { char: '🥚', name: 'Egg', aliases: ['protein'] },
  { char: '🧈', name: 'Butter', aliases: ['dairy'] },
  { char: '🥣', name: 'Bowl', aliases: ['cereal', 'yogurt', 'soup'] },
  // ── Household & Personal Care ───────────────────────────────
  { char: '🧼', name: 'Soap', aliases: ['cleaning', 'bar'] },
  { char: '🧴', name: 'Lotion bottle', aliases: ['shampoo', 'cleaning'] },
  { char: '🧻', name: 'Roll of paper', aliases: ['toilet paper', 'paper towels'] },
  { char: '🧹', name: 'Broom', aliases: ['cleaning'] },
  { char: '🧽', name: 'Sponge', aliases: ['cleaning'] },
  { char: '🪥', name: 'Toothbrush', aliases: ['dental', 'oral'] },
  { char: '🧯', name: 'Fire extinguisher', aliases: ['safety'] },
  { char: '🗑️', name: 'Trash can', aliases: ['waste', 'garbage'] },
  { char: '🛒', name: 'Shopping cart', aliases: ['groceries', 'shopping'] },
  { char: '🎁', name: 'Gift', aliases: ['present', 'wrapped'] },
  // ── Office & Stationery ─────────────────────────────────────
  { char: '✏️', name: 'Pencil', aliases: ['writing', 'stationery'] },
  { char: '📒', name: 'Notebook', aliases: ['journal', 'stationery'] },
  { char: '📦', name: 'Package', aliases: ['box', 'shipping'] },
  { char: '🔋', name: 'Battery', aliases: ['power'] },
  { char: '💡', name: 'Light bulb', aliases: ['lamp'] },
  // ── Misc / Fallback ─────────────────────────────────────────
  { char: '🛍️', name: 'Shopping bag', aliases: ['retail'] },
  { char: '⭐', name: 'Star', aliases: ['favorite', 'featured'] },
  { char: '❤️', name: 'Heart', aliases: ['love', 'favorite'] },
  { char: '🏷️', name: 'Label', aliases: ['tag', 'price'] },
];
