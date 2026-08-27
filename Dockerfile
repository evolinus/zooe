# Local preview of the site — pinned to Ruby 3.1 to match CI
# (.github/workflows uses ruby/setup-ruby with ruby-version "3.1"), so the
# pinned Gemfile.lock installs as-is and Jekyll 4.3 runs without the Ruby 3.3+
# logger crash. Not used for deployment; GitHub Pages builds the site itself.
FROM ruby:3.1

RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /site

# install gems first so this layer is cached until the Gemfile changes
COPY Gemfile Gemfile.lock ./
RUN bundle install

EXPOSE 4000 35729
CMD ["bundle", "exec", "jekyll", "serve", \
     "--host", "0.0.0.0", "--livereload", "--force_polling"]
