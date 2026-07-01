# CC Switch UI study

## 1. Provider selection layout

CC Switch keeps provider switching dense and operational. The useful patterns are:

- a clear current provider signal near the top;
- compact provider rows/cards with status badges;
- details and secondary actions kept beside or inside the selected item instead of repeated everywhere;
- search/filter/action controls close to the list;
- empty states that point to the next action.

ModelGate adopts the same structure for Account Switcher: current alias first, a compact alias list, and a separate selected-detail panel.

## 2. Usage layout

CC Switch usage surfaces are dashboard-like: summary numbers first, trends next, then detail tables and distribution views. The UI favors compact cards, labels, and small status markers over explanatory paragraphs.

ModelGate adopts:

- top summary cards for requests, tokens, cost, and active model;
- compact trend panels for requests, tokens, and cost;
- recent requests as a dense table;
- provider/model distribution as simple bars.

## 3. ModelGate changes in this round

- Account Switcher was reorganized into current alias, alias list, and selected detail areas.
- Alias cards now show only name, model, provider, status, and short description.
- Missing provider API keys are shown as warning badges.
- Usage Overview now uses a console-style layout with summary, trends, recent requests, and distribution panels.
- Error and detail-heavy information stays collapsed or scoped to the relevant item.

## 4. Patterns not adopted

ModelGate did not copy CC Switch's drag sorting, full provider action menu, toast stack, or React Query setup. Those are useful in a larger provider manager, but ModelGate currently benefits more from small typed API calls and local state.
