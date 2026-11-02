import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import {
  EMPTY_FILTERS,
  normalizePrice,
  parseDollars,
  PRICE_PRESETS,
  toggleIn,
  type SearchFilters,
} from '@/domain/filters';
import type { Category, Retailer, Subcategory } from '@/domain/types';
import { colors, hitTarget, radii, space, type as typeScale } from '@/theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Chip } from './Chip';
import { Sheet } from './Sheet';

interface FilterSheetProps {
  visible: boolean;
  value: SearchFilters;
  categories: readonly Category[];
  subcategories: readonly Subcategory[];
  retailers: readonly Retailer[];
  /** Live result count for a draft, so the button can say "Show 12 results". */
  countFor: (draft: SearchFilters) => number | null;
  onApply: (filters: SearchFilters) => void;
  onClose: () => void;
}

export function FilterSheet({ visible, onClose, ...rest }: FilterSheetProps) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Filters">
      {visible ? <FilterForm {...rest} onClose={onClose} /> : null}
    </Sheet>
  );
}

const centsToText = (c: number | null) => (c === null ? '' : String(Math.round(c / 100)));

function FilterForm({
  value,
  categories,
  subcategories,
  retailers,
  countFor,
  onApply,
  onClose,
}: Omit<FilterSheetProps, 'visible'>) {
  const [draft, setDraft] = useState<SearchFilters>(value);
  const [minText, setMinText] = useState(centsToText(value.minPriceCents));
  const [maxText, setMaxText] = useState(centsToText(value.maxPriceCents));
  const count = countFor(draft);

  const setPrice = (min: number | null, max: number | null) => {
    setDraft((d) => ({ ...d, minPriceCents: min, maxPriceCents: max }));
    setMinText(centsToText(min));
    setMaxText(centsToText(max));
  };

  return (
    <>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Group title="Room">
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.label}
              selected={draft.categoryIds.includes(c.id)}
              onPress={() => setDraft((d) => ({ ...d, categoryIds: toggleIn(d.categoryIds, c.id) }))}
            />
          ))}
        </Group>

        <Group title="Type">
          {subcategories
            .filter((t) => draft.categoryIds.length === 0 || draft.categoryIds.includes(t.categoryId))
            .map((t) => (
              <Chip
                key={t.id}
                label={t.label}
                selected={draft.subcategoryIds.includes(t.id)}
                onPress={() => setDraft((d) => ({ ...d, subcategoryIds: toggleIn(d.subcategoryIds, t.id) }))}
              />
            ))}
        </Group>

        <Group title="Price">
          {PRICE_PRESETS.map((p) => {
            const on = draft.minPriceCents === p.min && draft.maxPriceCents === p.max;
            return (
              <Chip
                key={p.label}
                label={p.label}
                selected={on}
                onPress={() => (on ? setPrice(null, null) : setPrice(p.min, p.max))}
              />
            );
          })}
        </Group>
        <View style={styles.priceRow}>
          <PriceInput
            label="Min price"
            value={minText}
            onChange={(t) => {
              setMinText(t);
              setDraft((d) => ({ ...d, minPriceCents: parseDollars(t) }));
            }}
          />
          <AppText color={colors.inkMuted}>to</AppText>
          <PriceInput
            label="Max price"
            value={maxText}
            onChange={(t) => {
              setMaxText(t);
              setDraft((d) => ({ ...d, maxPriceCents: parseDollars(t) }));
            }}
          />
        </View>

        <Group title="Store">
          {retailers.map((r) => (
            <Chip
              key={r.id}
              label={r.name}
              selected={draft.retailerIds.includes(r.id)}
              onPress={() => setDraft((d) => ({ ...d, retailerIds: toggleIn(d.retailerIds, r.id) }))}
            />
          ))}
        </Group>
      </ScrollView>

      <View style={styles.actions}>
        <Button
          label="Clear all"
          variant="secondary"
          onPress={() => {
            setDraft(EMPTY_FILTERS);
            setMinText('');
            setMaxText('');
          }}
        />
        <Button
          label={
            count === null
              ? 'Show results'
              : count === 0
                ? 'No results'
                : `Show ${count} result${count === 1 ? '' : 's'}`
          }
          disabled={count === 0}
          style={styles.apply}
          onPress={() => {
            onApply(normalizePrice(draft));
            onClose();
          }}
        />
      </View>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <AppText variant="label" accessibilityRole="header">
        {title}
      </AppText>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function PriceInput({ label, value, onChange }: { label: string; value: string; onChange: (t: string) => void }) {
  return (
    <View style={styles.priceField}>
      <AppText color={colors.inkMuted}>$</AppText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label === 'Min price' ? 'Min' : 'Max'}
        placeholderTextColor={colors.inkSubtle}
        keyboardType="number-pad"
        style={styles.priceInput}
        accessibilityLabel={`${label} in dollars`}
        maxLength={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  body: { gap: space.xl, paddingBottom: space.lg },
  group: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: -space.sm },
  priceField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: hitTarget,
    paddingHorizontal: space.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  priceInput: { flex: 1, minWidth: 0, minHeight: hitTarget, ...typeScale.body, color: colors.ink },
  actions: { flexDirection: 'row', gap: space.sm, paddingTop: space.sm },
  apply: { flex: 1 },
});
