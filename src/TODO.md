# General
- Panles should be near each other (in onw row) on the wide screens

# Tables
- Add to delete dialog the option: Do not show for the next 5 minutes (save in session storage)
- Make the width for index, Address, CW; SF, Buttons constant
- Edit mode is by default ON (save edit mode state)
- Toolbar should has a fix position
- Width of all inputs in a table 100%
- Sorting is only required by: name, address (default), description, type, role, room,
- Do not show index at all
- Implement indeterminate for CONTROL ALL checkboxes: if all off => off, if all on => on, if off or on => indeterminate
  - indeterninate => all ON
- All types except string has a constant length, that cannot be changed
  - 8 bit, 16 bit - has length 1
  - 32 bit, float - len 2,
  - 64 bit, double - len 4
  - String default - 2
- Factor by default is 1, Offset by default is 0,
- Role is by default level

- By add new line
  - if table is empty:
    - if alias - start from 40001, 30001, ...
    - if not alias - start from 0,
  - if table is not empty - use all settings of last element in the table, except name and description.

- Use for all buttons the icons.
- Disable delete all button if table is empty
- Use styles in different files and not all in one