---
title: Contact
nav:
  order: 5
  tooltip: Email, address, and location
---

# {% include icon.html icon="fa-regular fa-envelope" %}Contact

Our lab is located at the Department of Biology and Biotechnology of the University of Pavia.

{%
  include button.html
  type="email"
  text="lino.ometto@unipv.it"
  link="lino.ometto@unipv.it"
%}
{%
  include button.html
  type="phone"
  text="+39 0382 986079"
  link="+39 0382 986079"
%}
{%
  include button.html
  type="address"
  tooltip="Department of Biology and Biotechnology - University of Pavia - Via Ferrata 9 - 27100 Pavia - Italy"
  link="https://maps.app.goo.gl/9ZSSNfQ7WQkuJpNN7"
%}

{% include section.html %}

{% capture col1 %}

{%
  include figure.html
  image="images/photo.jpg"
  caption="Lorem ipsum"
%}

{% endcapture %}

{% capture col2 %}

{%
  include figure.html
  image="images/photo.jpg"
  caption="Lorem ipsum"
%}

{% endcapture %}

{% include cols.html col1=col1 col2=col2 %}

{% include section.html dark=true %}

{% capture col1 %}
Lorem ipsum dolor sit amet  
consectetur adipiscing elit  
sed do eiusmod tempor
{% endcapture %}

{% capture col2 %}
Lorem ipsum dolor sit amet  
consectetur adipiscing elit  
sed do eiusmod tempor
{% endcapture %}

{% capture col3 %}
Lorem ipsum dolor sit amet  
consectetur adipiscing elit  
sed do eiusmod tempor
{% endcapture %}

{% include cols.html col1=col1 col2=col2 col3=col3 %}
