// Model selects a visible target lane. No ball coordinates or computed direction are supplied.
export const instructions = "Which numbered column contains the white ball? Choose its current column, from 1 on the left to 5 on the right. Ignore the orange paddle.";
export const criteria = {
  '1': "The far-left column, numbered 1.",
  '2': "Column 2, left of center.",
  '3': "The middle column, numbered 3.",
  '4': "Column 4, right of center.",
  '5': "The far-right column, numbered 5.",
};
