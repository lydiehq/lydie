import { defineQuery } from "@rocicorp/zero";
import { z } from "zod";

import { isAuthenticated } from "../auth";
import { zql } from "../schema";

export const templateCategoryQueries = {
  all: defineQuery(z.object({}), ({ ctx }) => {
    isAuthenticated(ctx);
    return zql.template_categories.orderBy("name", "asc");
  }),
};
