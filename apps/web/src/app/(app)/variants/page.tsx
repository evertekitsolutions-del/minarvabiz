"use client";

import * as React from "react";
import { Button, Card, CardContent, FormField, inputClass } from "@minarvabiz/ui";
import { createParentWithVariants, listVariants, store } from "@minarvabiz/business-logic";
import type { Product } from "@minarvabiz/types";

export default function VariantsPage() {
  const [name, setName] = React.useState("");
  const [sizes, setSizes] = React.useState("S,M,L");
  const [colors, setColors] = React.useState("Red,Blue");
  const [cost, setCost] = React.useState(400);
  const [price, setPrice] = React.useState(899);
  const [stock, setStock] = React.useState(5);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [parents, setParents] = React.useState<Product[]>(() =>
    store.listProducts().filter((p) => p.hasVariants && !p.parentProductId)
  );

  const refresh = () =>
    setParents(store.listProducts().filter((p) => p.hasVariants && !p.parentProductId));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Product variants</h2>
      <p className="text-sm text-slate-500">
        Create a parent product with a size × colour matrix. Each cell becomes a sellable SKU with its own stock and barcode.
      </p>
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Product name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ladies Kurti" />
          </FormField>
          <FormField label="Sizes (comma)">
            <input className={inputClass} value={sizes} onChange={(e) => setSizes(e.target.value)} />
          </FormField>
          <FormField label="Colours (comma)">
            <input className={inputClass} value={colors} onChange={(e) => setColors(e.target.value)} />
          </FormField>
          <FormField label="Cost">
            <input className={inputClass} type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          </FormField>
          <FormField label="Selling price">
            <input className={inputClass} type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </FormField>
          <FormField label="Opening stock each">
            <input className={inputClass} type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} />
          </FormField>
          <div className="flex items-end">
            <Button
              onClick={() => {
                if (!name.trim()) return;
                const sizeList = sizes.split(",").map((s) => s.trim()).filter(Boolean);
                const colorList = colors.split(",").map((s) => s.trim()).filter(Boolean);
                const specs = [];
                for (const size of sizeList) {
                  for (const color of colorList) {
                    const code = `${name.slice(0, 3).toUpperCase()}-${size}-${color}`.replace(/\s/g, "");
                    specs.push({
                      size,
                      color,
                      costPrice: cost,
                      sellingPrice: price,
                      stockQuantity: stock,
                      sku: code,
                      barcode: `89${Math.floor(Math.random() * 1e10)}`.slice(0, 12),
                    });
                  }
                }
                const r = createParentWithVariants({ name }, specs);
                setMsg(r.errors.length ? r.errors.join(", ") : `Created ${r.variants.length} variants`);
                refresh();
              }}
            >
              Generate matrix
            </Button>
          </div>
        </CardContent>
      </Card>
      {parents.map((p) => (
        <Card key={p.id}>
          <CardContent className="p-4">
            <div className="mb-2 font-medium">{p.name}</div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-slate-500">
                  <th className="py-1">Variant</th>
                  <th>SKU</th>
                  <th>Barcode</th>
                  <th>Stock</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {listVariants(p.id).map((v) => (
                  <tr key={v.id} className="border-t border-slate-100">
                    <td className="py-1">{[v.size, v.color].filter(Boolean).join(" / ")}</td>
                    <td>{v.sku}</td>
                    <td className="font-mono text-xs">{v.barcode}</td>
                    <td>{v.stockQuantity}</td>
                    <td>{v.sellingPrice}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
