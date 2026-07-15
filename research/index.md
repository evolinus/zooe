---
title: Research
nav:
  order: 1
<<<<<<< HEAD
  tooltip: Projects and more
---


# {% include icon.html icon="fa-solid fa-wrench" %}Research Projects

In the **zoo**<span style="color:#e30022">**_**</span><span style="color:#ffbf00">**e**</span> lab, we mainly use comparative approaches to study the genetic basis of adaptation and evolution in animals. Insects are the main group of organisms we study (because they are fantastic), but we also enjoy studying other animals. Our lab works in close contact with other groups in our department working on the [genomics of insects of agricultural and medical importance](https://dbb.dip.unipv.it/en/research/research-teams-and-topics/genomics-and-biotechnology-insects-agricultural-and-sanitary). We also have ongoing collaborations with research groups in Italy and abroad, providing a constant flow of ideas, new skills and abilities, passion and enthusiasm. 

<!--
{% include tags.html tags="publication, resource, website" %}
-->
{% include search-info.html %}

{% include section.html %}

{% include list.html component="card" data="projects" filter="group == 'featured'" %}

{% include section.html %}

## More

{% include list.html component="card" data="projects" filter="!group" style="small" %}

{%
  include figure.html
  image="images/nbfc.png"
  width="100%"
%}

=======
  tooltip: Published works
---

# {% include icon.html icon="fa-solid fa-microscope" %}Research

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

{% include section.html %}

## Highlighted

{% include citation.html lookup="Open collaborative writing with Manubot" style="rich" %}

{% include section.html %}

## All

{% include search-box.html %}

{% include search-info.html %}

{% include list.html data="citations" component="citation" style="rich" %}
>>>>>>> template/main
