import type { WorldLayout } from "./layout.js";
export interface Blueprint {
  name?: string;
  id: string;
  revision: number;
  layout: WorldLayout;
  published: boolean;
}
export interface BlueprintStore {
  createBlueprint(
    layout: WorldLayout,
    ownerToken?: string,
    name?: string,
  ): Promise<Blueprint & { editToken: string }>;
  getBlueprint(id: string, editToken: string): Promise<Blueprint>;
  saveBlueprint(
    id: string,
    editToken: string,
    layout: WorldLayout,
    revision: number,
    publish: boolean,
    name?: string,
  ): Promise<Blueprint>;
  listBlueprints(token: string): Promise<Array<{ id: string; name: string; revision: number }>>;
  publishedBlueprint(id: string): Promise<WorldLayout>;
}
