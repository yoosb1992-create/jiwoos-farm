import type { WorldLayout } from "./layout.js";
export interface Blueprint {
  id: string;
  revision: number;
  layout: WorldLayout;
  published: boolean;
}
export interface BlueprintStore {
  createBlueprint(
    layout: WorldLayout,
  ): Promise<Blueprint & { editToken: string }>;
  getBlueprint(id: string, editToken: string): Promise<Blueprint>;
  saveBlueprint(
    id: string,
    editToken: string,
    layout: WorldLayout,
    revision: number,
    publish: boolean,
  ): Promise<Blueprint>;
  publishedBlueprint(id: string): Promise<WorldLayout>;
}
