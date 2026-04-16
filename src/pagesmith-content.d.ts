type __PagesmithCollections = typeof import("../content.config").default;

declare module "virtual:content" {
  const content: import("@pagesmith/site/vite").ContentModuleMap<__PagesmithCollections>;
  export default content;
}

declare module "virtual:content/homePage" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["homePage"]
  >;
  export default collection;
}

declare module "virtual:content/articleIndex" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["articleIndex"]
  >;
  export default collection;
}

declare module "virtual:content/blogIndex" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["blogIndex"]
  >;
  export default collection;
}

declare module "virtual:content/articles" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["articles"]
  >;
  export default collection;
}

declare module "virtual:content/blogs" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["blogs"]
  >;
  export default collection;
}

declare module "virtual:content/rootMeta" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["rootMeta"]
  >;
  export default collection;
}

declare module "virtual:content/articleMeta" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["articleMeta"]
  >;
  export default collection;
}

declare module "virtual:content/blogMeta" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["blogMeta"]
  >;
  export default collection;
}

declare module "virtual:content/homeData" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["homeData"]
  >;
  export default collection;
}

declare module "virtual:content/redirects" {
  const collection: import("@pagesmith/site/vite").ContentCollectionModule<
    __PagesmithCollections["redirects"]
  >;
  export default collection;
}
